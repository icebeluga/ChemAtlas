"use client";

import { addEntries, backupSchema, newDraft, worksheetStorageKey } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";

const BANK_WORKSHEET_KEY = "chematlas-student-worksheet-v1";

export function planWorksheetRestore(savedText: string | null, legacyText: string | null, createDraft: (name?: string) => Draft) {
  const draft = createDraft();
  let backup: Backup = { version: 1, active: draft.id, drafts: [draft] };
  const writes: Array<[string, string]> = [];
  const removals: string[] = [];
  try {
    const saved = backupSchema.safeParse(JSON.parse(savedText || "null"));
    if (saved.success) backup = saved.data;
    const legacy: unknown = JSON.parse(legacyText || "null");
    if (Array.isArray(legacy)) {
      const ids = legacy.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200);
      if (ids.length) {
        const target = backup.drafts.length < 100 && saved.success ? createDraft("Imported Question Bank selection") : backup.drafts.find(item => item.id === backup.active)!;
        const migrated = addEntries(target, ids);
        const drafts = backup.drafts.some(item => item.id === target.id)
          ? backup.drafts.map(item => item.id === target.id ? migrated : item)
          : [...backup.drafts, migrated];
        backup = { ...backup, active: migrated.id, drafts };
        writes.push([worksheetStorageKey, JSON.stringify(backup)]);
        if (ids.every(id => migrated.entries.some(entry => entry.id === id))) removals.push(BANK_WORKSHEET_KEY);
      }
    }
  } catch { /* Retain the latest validated backup if stored JSON is malformed. */ }
  return { backup, writes, removals };
}

export function restoreWorksheetBackup(): Backup {
  let savedText: string | null = null;
  let legacyText: string | null = null;
  try {
    savedText = localStorage.getItem(worksheetStorageKey);
    legacyText = localStorage.getItem(BANK_WORKSHEET_KEY);
  } catch { /* Retain any backup read before storage became unavailable. */ }
  const { backup, writes, removals } = planWorksheetRestore(savedText, legacyText, newDraft);
  try {
    for (const [key, value] of writes) localStorage.setItem(key, value);
    for (const key of removals) localStorage.removeItem(key);
  } catch { /* Keep the migrated draft in memory and leave the legacy key for retry. */ }
  return backup;
}

export function useWorksheets(backup: Backup | undefined, setBackup: (value: Backup) => void, onSaveError: (message: string) => void) {
  function save(next: Backup) {
    setBackup(next);
    try { localStorage.setItem(worksheetStorageKey, JSON.stringify(next)); }
    catch { onSaveError("Draft changes could not be saved in this browser. Download a worksheet backup before leaving."); }
  }
  const activeDraft = backup?.drafts.find(draft => draft.id === backup.active);
  const worksheetIds = activeDraft?.entries.map(entry => entry.id) ?? [];
  return { backup, save, activeDraft, worksheetIds };
}
