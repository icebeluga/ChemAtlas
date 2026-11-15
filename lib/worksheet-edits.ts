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
