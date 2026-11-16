"use client";

import { useState, useSyncExternalStore } from "react";
import { addEntries, backupSchema, draftSchema, newDraft, worksheetStorageKey } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";
import { adoptWorksheetBackup, initializeWorksheetDatabase, mergeWorksheetBackup, openWorksheetDatabase,
  saveWorksheetRecord, WorksheetConflict, worksheetTransaction } from "./worksheet-db";
import type { WorksheetMigration, WorksheetRecord } from "./worksheet-db";

const BANK_WORKSHEET_KEY = "chematlas-student-worksheet-v1";
export const worksheetRecoveryKey = `${worksheetStorageKey}-recovery`;
const saveWarning = "Draft changes could not be saved in this browser. Download drafts before leaving.";
const conflictWarning = "Another tab changed this worksheet. Your edits are only in this tab. Download drafts before reloading.";
const recoveryWarning = "Some older worksheet data needed recovery. The original browser data is preserved.";
const legacyEditWarning = "An older ChemAtlas tab changed the original worksheet data. Download drafts from that tab and import them here before closing it.";

function parseJson(text: string | null): unknown {
  try { return JSON.parse(text || "null"); } catch { return undefined; }
}

// Builds a backup from the drafts of an invalid one that pass draftSchema, after repairing
// fractional response-line overrides saved by builds that did not round that input.
function salvageBackup(value: unknown): Backup | undefined {
  const stored = value && typeof value === "object" ? value as { active?: unknown; drafts?: unknown } : {};
  if (!Array.isArray(stored.drafts)) return undefined;
  const drafts: Draft[] = [];
  for (const item of stored.drafts) {
    const repaired = item && typeof item === "object" && Array.isArray(item.entries)
      ? { ...item, entries: item.entries.map((entry: unknown) => {
        const lines = (entry as { lines?: unknown })?.lines;
        return typeof lines === "number" && Number.isFinite(lines) ? { ...(entry as object), lines: Math.min(12, Math.max(0, Math.round(lines))) } : entry;
      }) }
      : item;
    const parsed = draftSchema.safeParse(repaired);
    if (parsed.success && drafts.length < 100 && !drafts.some(draft => draft.id === parsed.data.id)) drafts.push(parsed.data);
  }
  if (!drafts.length) return undefined;
  const active = drafts.find(draft => draft.id === stored.active)?.id ?? drafts[0].id;
  return { version: 1, active, drafts };
}

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

type WorksheetSnapshot = { backup: Backup; warning?: string; unsaved?: Backup };

function createWorksheetStore() {
  let snapshot: WorksheetSnapshot | undefined;
  let committed: WorksheetRecord | undefined;
  let connection: Promise<IDBDatabase> | undefined;
  let channel: BroadcastChannel | undefined;
  let pending = 0;
  let blocked = false;
  let dirty = false;
  let legacyChanged = false;
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  function publish(next: WorksheetSnapshot) {
    snapshot = next;
    listeners.forEach(listener => listener());
  }

  function fail(error: unknown, unsaved?: Backup) {
    blocked = true;
    if (snapshot) publish({ ...snapshot, unsaved: unsaved ?? snapshot.unsaved,
      warning: error instanceof WorksheetConflict ? conflictWarning : saveWarning });
  }

  function adopt(record: WorksheetRecord) {
    committed = record;
    const backup = snapshot ? adoptWorksheetBackup(snapshot.backup, record.backup) : record.backup;
    const warning = legacyChanged ? legacyEditWarning : record.recoveryNeeded ? recoveryWarning : undefined;
    if (backup !== snapshot?.backup || warning !== snapshot?.warning) publish({ backup, warning });
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

  function onLegacyChange(event: StorageEvent) {
    if (!snapshot || blocked || ![worksheetStorageKey, worksheetRecoveryKey, BANK_WORKSHEET_KEY].includes(event.key ?? "")) return;
    legacyChanged = true;
    publish({ ...snapshot, warning: legacyEditWarning });
  }

  function start() {
    if (typeof BroadcastChannel === "function") {
      try {
        channel = new BroadcastChannel(worksheetStorageKey);
        channel.onmessage = () => { void refresh(); };
      } catch { /* Refresh on focus if this browser disallows the channel. */ }
    }
    if (connection) { void refresh(); return; }
    connection = openWorksheetDatabase();
    void connection.then(db => initializeWorksheetDatabase(db, () => planMigration(readMigrationSources())))
      .then(adopt).catch(() => {
        blocked = true;
        let backup: Backup;
        try { backup = planMigration(readMigrationSources()).backup; }
        catch { backup = planWorksheetRestore(null, null, newDraft).backup; }
        publish({ backup, warning: saveWarning });
      });
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (!pending && !dirty) return;
    event.preventDefault();
    event.returnValue = true;
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
    pending++;
    // Keep this tab's optimistic edits ordered. IndexedDB serializes transactions across tabs.
    queue = queue.then(async () => {
      if (blocked) return;
      committed = await saveWorksheetRecord(await database, revision, base, next);
      channel?.postMessage(committed.revision);
    }).catch(error => fail(error)).finally(() => {
      pending--;
      if (pending || blocked || !committed) return;
      dirty = false;
      adopt(committed);
      void refresh();
    });
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        start();
        window.addEventListener("focus", refresh);
        window.addEventListener("pageshow", refresh);
        window.addEventListener("storage", onLegacyChange);
        window.addEventListener("beforeunload", beforeUnload);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        channel?.close();
        channel = undefined;
        window.removeEventListener("focus", refresh);
        window.removeEventListener("pageshow", refresh);
        window.removeEventListener("storage", onLegacyChange);
        window.removeEventListener("beforeunload", beforeUnload);
      };
    },
    getSnapshot: () => snapshot,
    save,
  };
}

export function downloadWorksheetBackup(backup: Backup) {
  const link = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = link; a.download = "chematlas-worksheets.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(link), 1000);
}

export function useWorksheets() {
  const [store] = useState(createWorksheetStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => undefined);
  const backup = snapshot?.backup;
  const activeDraft = backup?.drafts.find(draft => draft.id === backup.active);
  const worksheetIds = activeDraft?.entries.map(entry => entry.id) ?? [];
  return { backup, warning: snapshot?.warning, unsaved: snapshot?.unsaved,
    save: (next: Backup) => { if (backup) store.save(backup, next); }, activeDraft, worksheetIds };
}
