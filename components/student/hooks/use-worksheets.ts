"use client";

import { addEntries, backupSchema, draftSchema, newDraft, worksheetStorageKey } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";

const BANK_WORKSHEET_KEY = "chematlas-student-worksheet-v1";
export const worksheetRecoveryKey = `${worksheetStorageKey}-recovery`;

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
  const draft = createDraft();
  let backup: Backup = { version: 1, active: draft.id, drafts: [draft] };
  const writes: Array<[string, string]> = [];
  const removals: string[] = [];
  const stored = parseJson(savedText);
  const saved = backupSchema.safeParse(stored);
  const salvaged = saved.success ? saved.data : salvageBackup(stored);
  if (salvaged) backup = salvaged;
  try {
    const legacy: unknown = JSON.parse(legacyText || "null");
    if (Array.isArray(legacy)) {
      const ids = legacy.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200);
      if (ids.length) {
        const target = backup.drafts.length < 100 && salvaged ? createDraft("Imported Question Bank selection") : backup.drafts.find(item => item.id === backup.active)!;
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

// Copies a stored backup that fails validation to the recovery key before anything replaces it.
// Throws when the copy cannot be made, so callers abort their write instead of destroying it.
function preserveInvalidBackup() {
  const current = localStorage.getItem(worksheetStorageKey);
  if (current === null || localStorage.getItem(worksheetRecoveryKey) !== null) return;
  if (!backupSchema.safeParse(parseJson(current)).success) localStorage.setItem(worksheetRecoveryKey, current);
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
    preserveInvalidBackup();
    for (const [key, value] of writes) localStorage.setItem(key, value);
    for (const key of removals) localStorage.removeItem(key);
  } catch { /* Keep the migrated draft in memory and leave the legacy key for retry. */ }
  return backup;
}

export function useWorksheets(backup: Backup | undefined, setBackup: (value: Backup) => void, onSaveError: (message: string) => void) {
  function save(next: Backup) {
    if (!backupSchema.safeParse(next).success) {
      onSaveError("That change was not saved because it would make your worksheet drafts invalid.");
      return;
    }
    setBackup(next);
    try {
      preserveInvalidBackup();
      localStorage.setItem(worksheetStorageKey, JSON.stringify(next));
    } catch { onSaveError("Draft changes could not be saved in this browser. Download a worksheet backup before leaving."); }
  }
  const activeDraft = backup?.drafts.find(draft => draft.id === backup.active);
  const worksheetIds = activeDraft?.entries.map(entry => entry.id) ?? [];
  return { backup, save, activeDraft, worksheetIds };
}
