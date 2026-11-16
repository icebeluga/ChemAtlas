import { backupSchema } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";

const databaseName = "chematlas-worksheets";
const storeName = "worksheets";
const currentKey = "current";

export type WorksheetRecord = { revision: number; backup: Backup; recoveryNeeded: boolean };
export type WorksheetMigration = {
  collection: string | null;
  recovery: string | null;
  legacySelection: string | null;
};

export class WorksheetConflict extends Error {}

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
  apply: (record: WorksheetRecord | undefined, store: IDBObjectStore) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode, mode === "readwrite" ? { durability: "strict" } : undefined);
    const store = transaction.objectStore(storeName);
    const request = store.get(currentKey);
    let result: T;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        const record = request.result as WorksheetRecord | undefined;
        if (record !== undefined && (!Number.isSafeInteger(record?.revision) || record.revision < 0 ||
          typeof record.recoveryNeeded !== "boolean" || !backupSchema.safeParse(record.backup).success)) {
          throw new Error("The stored worksheet collection is invalid.");
        }
        result = apply(record, store);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
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

export async function readWorksheetMigrationBaseline(db: IDBDatabase): Promise<WorksheetMigration> {
  const [original, acknowledged] = await worksheetTransaction(db, "readonly", (_, store) =>
    [store.get("migration"), store.get("acknowledged-legacy")]);
  const baseline = acknowledged.result ?? original.result;
  if (!baseline) throw new Error("The worksheet migration archive is missing.");
  return baseline;
}

export function acknowledgeLegacyWorksheets(db: IDBDatabase, sources: WorksheetMigration) {
  return worksheetTransaction(db, "readwrite", (current, store) => {
    if (!current) throw new Error("The worksheet collection has not been migrated.");
    store.put(sources, "acknowledged-legacy");
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

export function saveWorksheetRecord(db: IDBDatabase, expectedRevision: number, base: Backup, edit: Backup) {
  return worksheetTransaction(db, "readwrite", (current, store) => {
    if (!current || current.revision < expectedRevision) throw new WorksheetConflict();
    const backup = mergeWorksheetBackup(base, edit, current.backup);
    if (same(backup, current.backup)) return current;
    const record = { ...current, revision: current.revision + 1, backup };
    store.put(record, currentKey);
    return record;
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
