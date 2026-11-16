import { backupSchema, newWorksheetId } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";
import { outstandingRecoveryEntry } from "./worksheet-recovery";
import type { LegacyCapture, LegacyLedger } from "./worksheet-recovery";

const databaseName = "chematlas-worksheets";
const storeName = "worksheets";
const currentKey = "current";
const legacyLedgerKey = "legacy-recovery";
const legacyRawKey = (id: string) => `legacy-raw:${id}`;
type ReadRequest = <T>(request: IDBRequest<T>, read: (value: T) => void) => void;

export type WorksheetRecord = { revision: number; backup: Backup; recoveryNeeded: boolean };
export type WorksheetMigration = {
  collection: string | null;
  recovery: string | null;
  legacySelection: string | null;
};

export class WorksheetConflict extends Error {}
export class WorksheetImportLimit extends Error {}

export function openWorksheetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      reject(new Error("Worksheet database upgrade is blocked."));
      request.onsuccess = () => request.result.close();
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export function worksheetTransaction<T>(db: IDBDatabase, mode: IDBTransactionMode,
  apply: (record: WorksheetRecord | undefined, store: IDBObjectStore, read: ReadRequest) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
    const store = transaction.objectStore(storeName);
    const request = store.get(currentKey);
    let result: T;
    let failure: unknown;
    function read<TValue>(request: IDBRequest<TValue>, accept: (value: TValue) => void) {
      request.onsuccess = () => {
        try { accept(request.result); }
        catch (error) {
          failure = error;
          transaction.abort();
        }
      };
    }
    read(request, value => {
      const record = value as WorksheetRecord | undefined;
      if (record !== undefined && (!Number.isSafeInteger(record?.revision) || record.revision < 0 ||
        typeof record.recoveryNeeded !== "boolean" || !backupSchema.safeParse(record.backup).success)) {
        throw new Error("The stored worksheet collection is invalid.");
      }
      result = apply(record, store, read);
    });
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Worksheet transaction aborted."));
    transaction.oncomplete = () => resolve(result);
  });
}

export function initializeWorksheetDatabase(db: IDBDatabase, migrate: () => { backup: Backup; sources: WorksheetMigration; recoveryNeeded: boolean }) {
  return worksheetTransaction(db, "readwrite", (current, store) => {
    if (current) return current;
    const { backup, sources, recoveryNeeded } = migrate();
    const record: WorksheetRecord = { revision: 0, backup: backupSchema.parse(backup), recoveryNeeded };
    store.add(sources, "migration");
    store.add(record, currentKey);
    return record;
  });
}

export async function readWorksheetMigrationSources(db: IDBDatabase): Promise<{ original: WorksheetMigration; historical?: WorksheetMigration }> {
  const [original, historical] = await worksheetTransaction(db, "readonly", (_, store) =>
    [store.get("migration"), store.get("acknowledged-legacy")]);
  if (!original.result) throw new Error("The worksheet migration archive is missing.");
  return { original: original.result, historical: historical.result };
}

function recoveryTransaction<T>(db: IDBDatabase, mode: "readonly" | "readwrite",
  apply: (current: WorksheetRecord, store: IDBObjectStore, ledger: LegacyLedger) => T) {
  return worksheetTransaction(db, mode, (current, store, read) => {
    if (!current) throw new Error("The worksheet collection has not been migrated.");
    const result = {} as { value: T };
    read(store.get(legacyLedgerKey), saved => {
      result.value = apply(current, store, saved ?? { snapshots: [], recovered: [] });
    });
    return result;
  }).then(result => result.value);
}

export function archiveLegacyWorksheets(db: IDBDatabase, captures: LegacyCapture[]) {
  return recoveryTransaction(db, captures.length ? "readwrite" : "readonly", (_, store, ledger) => {
    const known = new Set(ledger.snapshots.map(snapshot => snapshot.id));
    const snapshots = [...ledger.snapshots];
    for (const { snapshot, raw } of captures) {
      if (known.has(snapshot.id)) continue;
      store.add(raw, legacyRawKey(snapshot.id));
      snapshots.push(snapshot);
      known.add(snapshot.id);
    }
    if (snapshots.length === ledger.snapshots.length) return ledger;
    const next = { ...ledger, snapshots };
    store.put(next, legacyLedgerKey);
    return next;
  });
}

export async function readLegacySnapshot(db: IDBDatabase, id: string): Promise<string> {
  const request = await worksheetTransaction(db, "readonly", (_, store) => store.get(legacyRawKey(id)));
  if (typeof request.result !== "string") throw new Error("The legacy snapshot is missing.");
  return request.result;
}

export function acknowledgeLegacySnapshot(db: IDBDatabase, id: string) {
  return recoveryTransaction(db, "readwrite", (_, store, ledger) => {
    const snapshot = ledger.snapshots.find(item => item.id === id);
    if (!snapshot) throw new Error("The legacy snapshot is missing.");
    if (snapshot.acknowledged) return ledger;
    const recovered = new Set(ledger.recovered);
    if (snapshot.entries.some(entry => outstandingRecoveryEntry(entry, recovered))) {
      throw new Error("Recover the remaining worksheets before acknowledging this snapshot.");
    }
    const next = { ...ledger, snapshots: ledger.snapshots.map(item => item.id === id ? { ...item, acknowledged: true } : item) };
    store.put(next, legacyLedgerKey);
    return next;
  });
}

export function recoverLegacyWorksheet(db: IDBDatabase, id: string, entryIndex: number) {
  return recoveryTransaction(db, "readwrite", (current, store, ledger) => {
    const snapshot = ledger.snapshots.find(item => item.id === id);
    const entry = snapshot?.entries[entryIndex];
    if (!entry) throw new Error("The requested recovery entry is missing.");
    const remaining = outstandingRecoveryEntry(entry, new Set(ledger.recovered));
    if (!remaining) return { record: current, ledger, recovered: false };
    if (snapshot.acknowledged) throw new Error("The snapshot has been acknowledged.");
    if (current.backup.drafts.length >= 100) throw new WorksheetImportLimit();
    const draft = { ...remaining.draft, id: newWorksheetId() };
    const backup = backupSchema.parse({ ...current.backup, drafts: [...current.backup.drafts, draft], active: draft.id });
    const record = { ...current, revision: current.revision + 1, backup };
    const next = { ...ledger, recovered: [...ledger.recovered, ...remaining.receipts] };
    store.put(record, currentKey);
    store.put(next, legacyLedgerKey);
    return { record, ledger: next, recovered: true };
  });
}

function same<T>(a: T, b: T) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function reconcileField<T>(before: T, edit: T, current: T): T {
  if (same(before, edit)) return current;
  if (same(before, current) || same(edit, current)) return edit;
  throw new WorksheetConflict();
}

export function mergeWorksheetBackup(base: Backup, edit: Backup, current: Backup): Backup {
  const from = new Map(base.drafts.map(draft => [draft.id, draft]));
  const changes = new Map(edit.drafts.map(draft => [draft.id, draft]));
  const saved = new Map(current.drafts.map(draft => [draft.id, draft]));
  for (const [id, before] of from) {
    const after = changes.get(id);
    if (same(before, after)) continue;
    const latest = saved.get(id);
    if (latest && after) {
      saved.set(id, {
        id,
        name: reconcileField(before.name, after.name, latest.name),
        format: reconcileField(before.format, after.format, latest.format),
        entries: reconcileField(before.entries, after.entries, latest.entries),
      });
    } else if (same(latest, before) || (!latest && !after)) {
      saved.delete(id);
    } else {
      throw new WorksheetConflict();
    }
  }
  for (const [id, draft] of changes) {
    if (from.has(id)) continue;
    if (saved.has(id) && !same(draft, saved.get(id))) throw new WorksheetConflict();
    saved.set(id, draft);
  }
  const active = base.active === edit.active ? current.active : edit.active;
  const merged: Backup = { version: 1, active, drafts: [...saved.values()] };
  if (!backupSchema.safeParse(merged).success) throw new WorksheetConflict();
  return merged;
}

function updateWorksheetRecord(db: IDBDatabase, expectedRevision: number, update: (current: Backup) => Backup) {
  return worksheetTransaction(db, "readwrite", (current, store) => {
    if (!current || current.revision < expectedRevision) throw new WorksheetConflict();
    const backup = update(current.backup);
    if (same(backup, current.backup)) return current;
    const record = { ...current, revision: current.revision + 1, backup };
    store.put(record, currentKey);
    return record;
  });
}

export function saveWorksheetRecord(db: IDBDatabase, expectedRevision: number, base: Backup, edit: Backup) {
  return updateWorksheetRecord(db, expectedRevision, current => mergeWorksheetBackup(base, edit, current));
}

export function importWorksheetRecord(db: IDBDatabase, expectedRevision: number, incoming: Backup) {
  return updateWorksheetRecord(db, expectedRevision, current => {
    if (current.drafts.length + incoming.drafts.length > 100) throw new WorksheetImportLimit();
    return backupSchema.parse({ ...current, drafts: [...current.drafts, ...incoming.drafts], active: incoming.active });
  });
}

export function adoptWorksheetBackup(local: Backup, saved: Backup): Backup {
  const localDrafts = new Map(local.drafts.map(draft => [draft.id, draft]));
  const drafts = saved.drafts.map((draft): Draft => {
    const previous = localDrafts.get(draft.id);
    if (!previous || same(previous, draft)) return previous ?? draft;
    return { ...draft, format: same(previous.format, draft.format) ? previous.format : draft.format,
      entries: same(previous.entries, draft.entries) ? previous.entries : draft.entries };
  });
  // Another tab's selection must not change the worksheet an open editor is targeting.
  const active = saved.drafts.some(draft => draft.id === local.active) ? local.active : saved.active;
  return active === local.active && drafts.length === local.drafts.length &&
    drafts.every((draft, index) => draft === local.drafts[index]) ? local : { ...saved, active, drafts };
}
