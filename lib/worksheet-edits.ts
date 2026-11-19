import type { Draft } from "./worksheet";

export function moveEntry(draft: Draft, from: number, to: number): Draft {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to ||
      from < 0 || from >= draft.entries.length || to < 0 || to >= draft.entries.length) return draft;
  const entries = [...draft.entries];
  const [entry] = entries.splice(from, 1);
  entries.splice(to, 0, entry);
  return { ...draft, entries };
}

export function replaceEntry(draft: Draft, oldId: string, newId: string): Draft {
  return { ...draft, entries: draft.entries.map(entry => entry.id === oldId ? { ...entry, id: newId, lines: undefined } : entry) };
}

export type UndoStep = { before: Draft; after: Draft };
const undoFields = ["name", "format", "entries"] as const;

// Reverts only the fields the remembered step changed, and only while each is still exactly what that step
// produced; later edits to other fields survive, and a later edit to the same field makes Undo unavailable.
export function applyUndo(current: Draft, step: UndoStep | undefined): Draft | undefined {
  if (!step || current.id !== step.after.id) return undefined;
  const changed = undoFields.filter(key => step.before[key] !== step.after[key]);
  if (!changed.length || changed.some(key => current[key] !== step.after[key])) return undefined;
  return { ...current, ...Object.fromEntries(changed.map(key => [key, step.before[key]])) };
}
