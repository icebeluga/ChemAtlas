"use client";

import { useState, useSyncExternalStore } from "react";
import { addEntries, backupSchema, newDraft, newWorksheetId, worksheetStorageKey } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";
import { acknowledgeLegacySnapshot, adoptWorksheetBackup, archiveLegacyWorksheets, importWorksheetRecord, initializeWorksheetDatabase,
  keepLegacyEntryArchived, LegacyEntryArchived, mergeWorksheetBackup, openWorksheetDatabase, readLegacySnapshot,
  readWorksheetMigrationSources, recoverLegacyWorksheet,
  saveWorksheetRecord, WorksheetConflict, WorksheetImportLimit, worksheetTransaction } from "./worksheet-db";
import type { WorksheetMigration, WorksheetRecord } from "./worksheet-db";
import { legacySourceFile, legacySources, parseJson, prepareLegacyCapture, salvageBackup } from "./worksheet-recovery";
import type { LegacyLedger, LegacyObservation } from "./worksheet-recovery";

const BANK_WORKSHEET_KEY = "chematlas-student-worksheet-v1";
export const worksheetRecoveryKey = `${worksheetStorageKey}-recovery`;
const saveWarning = "Draft changes could not be saved in this browser. Download drafts before leaving.";
const conflictWarning = "Another tab changed this worksheet. Your edits are only in this tab. Download drafts before reloading.";
const recoveryWarning = "Some older worksheet data needed recovery. The original browser data is preserved.";
const legacyUnavailable = "Worksheet storage is unavailable. Download any legacy data you need before leaving, then reopen the app when storage is available.";
const legacyKeys: Record<string, keyof WorksheetMigration> = {
  [worksheetStorageKey]: "collection", [worksheetRecoveryKey]: "recovery", [BANK_WORKSHEET_KEY]: "legacySelection",
};
export function planWorksheetRestore(savedText: string | null, legacyText: string | null, createDraft: (name?: string) => Draft) {
  const stored = parseJson(savedText);
  const saved = backupSchema.safeParse(stored);
  const salvaged = saved.success ? saved.data : salvageBackup(stored);
  const first = salvaged?.drafts[0] ?? createDraft();
  const backup: Backup = salvaged ?? { version: 1, active: first.id, drafts: [first] };
  const legacy = parseJson(legacyText);
  const recoveryNeeded = (savedText !== null && !saved.success) || (legacyText !== null && !Array.isArray(legacy));
  if (!Array.isArray(legacy)) return { backup, recoveryNeeded };

  const ids = legacy.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200);
  if (!ids.length) return { backup, recoveryNeeded: recoveryNeeded || legacy.length > 0 };
  // The old app could import these selections and then fail to remove the legacy key.
  const imported = backup.drafts.some(item => item.name === "Imported Question Bank selection" &&
    ids.every(id => item.entries.some(entry => entry.id === id)));
  if (imported) return { backup, recoveryNeeded: recoveryNeeded || ids.length !== legacy.length };
  const target = backup.drafts.length < 100 && salvaged ? createDraft("Imported Question Bank selection") : backup.drafts.find(item => item.id === backup.active)!;
  const migrated = addEntries(target, ids);
  const drafts = backup.drafts.some(item => item.id === target.id)
    ? backup.drafts.map(item => item.id === target.id ? migrated : item)
    : [...backup.drafts, migrated];
  return { backup: { ...backup, active: migrated.id, drafts },
    recoveryNeeded: recoveryNeeded || ids.length !== legacy.length || ids.some(id => !migrated.entries.some(entry => entry.id === id)) };
}

function readMigrationSources(): WorksheetMigration {
  return { collection: localStorage.getItem(worksheetStorageKey), recovery: localStorage.getItem(worksheetRecoveryKey),
    legacySelection: localStorage.getItem(BANK_WORKSHEET_KEY) };
}

function planMigration(sources: WorksheetMigration) {
  // Use an earlier recovery copy only when the primary contains no usable draft.
  const useRecovery = !salvageBackup(parseJson(sources.collection)) && !!salvageBackup(parseJson(sources.recovery));
  const restore = planWorksheetRestore(useRecovery ? sources.recovery : sources.collection, sources.legacySelection, newDraft);
  return { ...restore, sources, recoveryNeeded: restore.recoveryNeeded || useRecovery };
}

type WorksheetSnapshot = {
  backup: Backup;
  warning?: string;
  rejectedEdits?: Backup[];
  importing?: boolean;
  pendingImport?: { backup: Backup; reason: string };
  legacy?: LegacyLedger;
  legacyError?: string;
  legacyMessage?: string;
  legacyUnavailable?: boolean;
  unarchived?: LegacyObservation[];
};
export type WorksheetImportResult = "saved" | "retained" | "invalid" | "busy";

function createWorksheetStore() {
  let snapshot: WorksheetSnapshot | undefined;
  let committed: WorksheetRecord | undefined;
  let connection: Promise<IDBDatabase> | undefined;
  let channel: BroadcastChannel | undefined;
  let pending = 0;
  let blocked = false;
  let dirty = false;
  let legacy: LegacyLedger | undefined;
  let legacyError: string | undefined;
  let legacyMessage: string | undefined;
  let legacyReady = false;
  let originalLegacy: WorksheetMigration | undefined;
  const observations = new Map<string, LegacyObservation>();
  const lastCaptured = new Map<keyof WorksheetMigration, string>();
  let legacyQueue: Promise<void> = Promise.resolve();
  let importedSelection: { previous: string; next: string } | undefined;
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function publish(next: WorksheetSnapshot) {
    snapshot = next;
    listeners.forEach(listener => listener());
  }

  function fail(error: unknown, unsaved?: Backup) {
    blocked = true;
    if (snapshot) publish({ ...snapshot, rejectedEdits: unsaved ? [...(snapshot.rejectedEdits ?? []), unsaved] : snapshot.rejectedEdits,
      warning: unsaved ? "An edit conflicted with newer worksheet changes. Download the current drafts and the separate rejected edit before reloading."
        : error instanceof WorksheetConflict ? conflictWarning : saveWarning });
  }

  function adopt(record: WorksheetRecord, active?: string) {
    committed = record;
    const backup = snapshot ? adoptWorksheetBackup(active ? { ...snapshot.backup, active } : snapshot.backup, record.backup) : record.backup;
    const warning = record.recoveryNeeded ? recoveryWarning : undefined;
    if (backup !== snapshot?.backup || warning !== snapshot?.warning) publish({ ...snapshot, backup, warning,
      legacy, legacyError, legacyMessage, unarchived: [...observations.values()] });
  }

  function notify(message: string | number) {
    try { channel?.postMessage(message); }
    catch { /* An already committed write stays successful. Other tabs can refresh on focus. */ }
  }

  async function refresh() {
    if (!connection || pending || blocked || !committed) return;
    const revision = committed.revision;
    try {
      const db = await connection;
      const record = await worksheetTransaction(db, "readonly", current => current);
      if (pending || blocked) return;
      if (record && record.revision > committed.revision) adopt(record);
      else if ((!record || record.revision < revision) && committed.revision === revision) throw new WorksheetConflict();
    } catch (error) {
      if (!pending && !blocked) fail(error);
    }
  }

  function publishLegacy() {
    if (snapshot) publish({ ...snapshot, legacy, legacyError, legacyMessage, legacyUnavailable: !legacyReady,
      unarchived: [...observations.values()] });
  }

  function rememberLegacy(source: keyof WorksheetMigration, raw: string | null) {
    if (raw === null || raw === lastCaptured.get(source)) return;
    observations.set(JSON.stringify([source, raw]), { source, raw });
  }

  function rememberSources(sources: WorksheetMigration) {
    for (const source of legacySources) rememberLegacy(source, sources[source]);
  }

  function queueLegacyAction(operation: (db: IDBDatabase) => Promise<void>, onError: (error: unknown) => void) {
    if (!connection || !legacyReady) return Promise.resolve();
    const database = connection;
    legacyQueue = legacyQueue.then(async () => operation(await database)).catch(onError).finally(publishLegacy);
    return legacyQueue;
  }

  function refreshLegacy() {
    // Capture the strings before yielding. A previous-build tab can replace them
    // while this tab waits for another IndexedDB transaction to finish.
    const readError = "Older worksheet storage could not be read. Previously archived snapshots are still available.";
    let readFailed = false;
    try { rememberSources(readMigrationSources()); }
    catch {
      readFailed = true;
      legacyError = readError;
      publishLegacy();
    }
    if (!legacyReady) {
      if (snapshot && observations.size) {
        legacyError = legacyUnavailable;
        publishLegacy();
      }
      return Promise.resolve();
    }
    return queueLegacyAction(async db => {
      if (!originalLegacy) {
        const { original, historical } = await readWorksheetMigrationSources(db);
        originalLegacy = original;
        // Earlier builds acknowledged all live keys at once. Keep the historical
        // record and recover its bytes without treating it as a recovery receipt.
        if (historical) rememberSources(historical);
      }
      const original = originalLegacy;
      const batch = [...observations];
      const changed = batch.filter(([, item]) => original[item.source] !== item.raw);
      const captures = await Promise.all(changed.map(([, item]) => prepareLegacyCapture(item, original)));
      legacy = await archiveLegacyWorksheets(db, captures);
      for (const [key, item] of batch) {
        observations.delete(key);
        lastCaptured.set(item.source, item.raw);
      }
      if (captures.length) notify("legacy-recovery");
      legacyError = readFailed ? readError : undefined;
    }, () => {
      legacyError = "Legacy recovery could not be archived. Download any changes available only in this tab before leaving.";
    });
  }

  function acknowledge(id: string) {
    return queueLegacyAction(async db => {
      legacy = await acknowledgeLegacySnapshot(db, id);
      legacyMessage = "This legacy snapshot was acknowledged.";
      notify("legacy-recovery");
    }, () => {
      legacyMessage = "This snapshot could not be acknowledged. Check its outstanding worksheets and try again.";
    });
  }

  function keepArchived(id: string, entryIndex: number) {
    return queueLegacyAction(async db => {
      const result = await keepLegacyEntryArchived(db, id, entryIndex);
      legacy = result.ledger;
      legacyMessage = result.kept ? "This revision was kept in the archive without importing." : "This revision was already recovered as a worksheet.";
      notify("legacy-recovery");
    }, () => {
      legacyMessage = "The archive-only choice could not be saved. The snapshot is still available.";
    });
  }

  function recover(id: string, entryIndex: number, fromArchive = false) {
    return enqueue(() => queueLegacyAction(async db => {
      if (blocked || !snapshot) throw new Error("Worksheet storage is unavailable.");
      const previous = snapshot.backup.active;
      const result = await recoverLegacyWorksheet(db, id, entryIndex, fromArchive);
      committed = result.record;
      legacy = result.ledger;
      if (result.recovered) {
        importedSelection = { previous, next: result.record.backup.active };
        notify(result.record.revision);
        notify("legacy-recovery");
      }
      legacyMessage = result.recovered ? "Legacy worksheet recovered." : "This legacy worksheet was already recovered.";
    }, error => {
      if (error instanceof LegacyEntryArchived) {
        legacyMessage = "This revision was kept in the archive. Use Recover archived worksheet to import it.";
        void refreshLegacy();
        return;
      }
      legacyMessage = error instanceof WorksheetImportLimit
        ? "This worksheet could not be recovered because the collection has reached 100 worksheets. The archived snapshot is still available."
        : "This worksheet could not be recovered. The archived snapshot is still available to retry.";
    }));
  }

  async function downloadLegacy(id: string) {
    if (!connection) return;
    try {
      const raw = await readLegacySnapshot(await connection, id);
      downloadLegacySource(raw, `blueberry-legacy-${id}`);
    } catch {
      legacyMessage = "This archived legacy snapshot could not be downloaded. Try again.";
      publishLegacy();
    }
  }

  function onLegacyChange(event: StorageEvent) {
    if (event.key !== null) {
      const source = legacyKeys[event.key];
      if (!source) return;
      // The event carries the exact value even if another old tab has already
      // advanced the live key by the time this handler runs.
      rememberLegacy(source, event.newValue);
    }
    void refreshLegacy();
  }

  function onResume() {
    void refresh();
    void refreshLegacy();
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") onResume();
  }

  function start() {
    if (typeof BroadcastChannel === "function") {
      try {
        channel = new BroadcastChannel(worksheetStorageKey);
        channel.onmessage = event => {
          if (event.data === "legacy-recovery") void refreshLegacy();
          else void refresh();
        };
      } catch { /* Refresh on focus if this browser disallows the channel. */ }
    }
    if (connection) { onResume(); return; }
    connection = openWorksheetDatabase();
    void connection.then(db => initializeWorksheetDatabase(db, () => planMigration(readMigrationSources())))
      .then(async record => {
        legacyReady = true;
        await refreshLegacy();
        adopt(record);
        void refresh();
      }).catch(() => {
        blocked = true;
        let backup: Backup;
        try {
          const sources = readMigrationSources();
          rememberSources(sources);
          backup = planMigration(sources).backup;
        }
        catch { backup = planWorksheetRestore(null, null, newDraft).backup; }
        publish({ backup, warning: saveWarning });
        if (observations.size) legacyError = legacyUnavailable;
        publishLegacy();
      });
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (!pending && !dirty && !snapshot?.importing && !snapshot?.pendingImport && !observations.size) return;
    event.preventDefault();
    event.returnValue = true;
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    pending++;
    const result = queue.then(operation).finally(() => {
      pending--;
      if (pending) return;
      const imported = importedSelection;
      importedSelection = undefined;
      if (blocked || !committed) return;
      dirty = false;
      adopt(committed, imported && snapshot?.backup.active === imported.previous ? imported.next : undefined);
      void refresh();
    });
    queue = result.then(() => {}, () => {});
    return result;
  }

  function save(base: Backup, next: Backup) {
    if (!snapshot) return;
    if (!backupSchema.safeParse(next).success) {
      publish({ ...snapshot, warning: "That change was not saved because it would make your worksheet drafts invalid." });
      return;
    }
    dirty = true;
    try {
      const optimistic = base === snapshot.backup ? next : mergeWorksheetBackup(base, next, snapshot.backup);
      publish({ ...snapshot, backup: optimistic });
    } catch (error) {
      fail(error, next);
      return;
    }
    if (blocked || !connection || !committed) return;
    const database = connection;
    const revision = committed.revision;
    // Keep this tab's optimistic edits ordered. IndexedDB serializes the transactions across tabs.
    void enqueue(async () => {
      if (blocked) return;
      try {
        committed = await saveWorksheetRecord(await database, revision, base, next);
        notify(committed.revision);
      } catch (error) { fail(error); }
    });
  }

  async function importDrafts(file: File): Promise<WorksheetImportResult> {
    if (!snapshot || snapshot.importing || snapshot.pendingImport) return "busy";
    publish({ ...snapshot, importing: true });
    let source: Backup;
    try {
      if (file.size > 2_000_000) throw new Error("Worksheet backup is too large.");
      source = backupSchema.parse(JSON.parse(await file.text()));
    } catch {
      if (snapshot) publish({ ...snapshot, importing: false });
      return "invalid";
    }

    const drafts = source.drafts.map(draft => ({ ...draft, id: newWorksheetId() }));
    const incoming = { ...source, drafts, active: drafts[source.drafts.findIndex(draft => draft.id === source.active)].id };
    // Check capacity against the latest durable collection in the same transaction
    // as the write, including any saves made while the file was being read.
    return enqueue(async () => {
      if (!snapshot) return "busy";
      const previous = snapshot.backup.active;
      try {
        if (blocked || !committed || !connection) throw new Error("Worksheet storage is unavailable.");
        committed = await importWorksheetRecord(await connection, committed.revision, incoming);
        importedSelection = { previous, next: incoming.active };
        notify(committed.revision);
        publish({ ...snapshot, importing: false });
        return "saved";
      } catch (error) {
        const reason = error instanceof WorksheetImportLimit
          ? "Import would exceed the 100-worksheet limit. The import is still available to download."
          : "The import could not be saved. The import is still available to download.";
        publish({ ...snapshot, importing: false, pendingImport: { backup: source, reason } });
        return "retained";
      }
    });
  }

  function discardPendingImport() {
    if (snapshot?.pendingImport) publish({ ...snapshot, pendingImport: undefined });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        start();
        window.addEventListener("focus", onResume);
        window.addEventListener("pageshow", onResume);
        window.addEventListener("storage", onLegacyChange);
        window.addEventListener("beforeunload", beforeUnload);
        document.addEventListener("visibilitychange", onVisibilityChange);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        channel?.close();
        channel = undefined;
        window.removeEventListener("focus", onResume);
        window.removeEventListener("pageshow", onResume);
        window.removeEventListener("storage", onLegacyChange);
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    },
    getSnapshot: () => snapshot,
    save,
    acknowledge,
    keepArchived,
    recover,
    downloadLegacy,
    refreshLegacy,
    importDrafts,
    discardPendingImport,
  };
}

function downloadWorksheetData(text: string, filename: string) {
  const link = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = link; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(link), 1000);
}

export function downloadLegacySource(source: string, filename: string) {
  const file = legacySourceFile(source, filename);
  downloadWorksheetData(file.text, file.filename);
}

export function downloadWorksheetBackup(backup: Backup, filename = "blueberry-worksheets.json") {
  downloadWorksheetData(JSON.stringify(backup, null, 2), filename);
}

export function useWorksheets() {
  const [store] = useState(createWorksheetStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => undefined);
  const backup = snapshot?.backup;
  const activeDraft = backup?.drafts.find(draft => draft.id === backup.active);
  const worksheetIds = activeDraft?.entries.map(entry => entry.id) ?? [];
  return { backup, warning: snapshot?.warning, rejectedEdits: snapshot?.rejectedEdits, legacy: snapshot?.legacy,
    legacyError: snapshot?.legacyError, legacyMessage: snapshot?.legacyMessage, legacyUnavailable: snapshot?.legacyUnavailable,
    unarchived: snapshot?.unarchived,
    acknowledgeLegacy: store.acknowledge, keepLegacyArchived: store.keepArchived, recoverLegacy: store.recover, downloadLegacy: store.downloadLegacy,
    retryLegacyArchive: store.refreshLegacy,
    importing: snapshot?.importing, pendingImport: snapshot?.pendingImport, importDrafts: store.importDrafts,
    discardPendingImport: store.discardPendingImport,
    save: (next: Backup) => { if (backup) store.save(backup, next); }, activeDraft, worksheetIds };
}
