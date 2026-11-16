import { draftSchema, defaultFormat } from "@/lib/worksheet";
import type { Backup, Draft } from "@/lib/worksheet";
import type { WorksheetMigration } from "./worksheet-db";

export const legacySourceLabels = { collection: "saved worksheets", recovery: "recovery copy", legacySelection: "Question Bank selection" } as const;
export const legacySources = Object.keys(legacySourceLabels) as (keyof WorksheetMigration)[];
export type LegacyObservation = { source: keyof WorksheetMigration; raw: string };
export type LegacyRecoveryEntry = { draft: Draft; receipts: string[] };
export type LegacySnapshot = {
  id: string;
  source: LegacyObservation["source"];
  entries: LegacyRecoveryEntry[];
  acknowledged: boolean;
};
export type LegacyCapture = { snapshot: LegacySnapshot; raw: string };
export type LegacyLedger = { snapshots: LegacySnapshot[]; recovered: string[] };

export function parseJson(text: string | null): unknown {
  try { return JSON.parse(text || "null"); } catch { return undefined; }
}

// Retain valid drafts from a damaged collection and repair historical fractional lines.
export function salvageBackup(value: unknown): Backup | undefined {
  const stored = value && typeof value === "object" ? value as { active?: unknown; drafts?: unknown } : {};
  if (!Array.isArray(stored.drafts)) return undefined;
  const drafts: Draft[] = [];
  for (const item of stored.drafts) {
    const repaired = item && typeof item === "object" && Array.isArray(item.entries)
      ? { ...item, entries: item.entries.map((entry: unknown) => {
        const lines = (entry as { lines?: unknown })?.lines;
        return typeof lines === "number" && Number.isFinite(lines)
          ? { ...(entry as object), lines: Math.min(12, Math.max(0, Math.round(lines))) }
          : entry;
      }) }
      : item;
    const parsed = draftSchema.safeParse(repaired);
    if (parsed.success && drafts.length < 100 && !drafts.some(draft => draft.id === parsed.data.id)) drafts.push(parsed.data);
  }
  if (!drafts.length) return undefined;
  const active = drafts.find(draft => draft.id === stored.active)?.id ?? drafts[0].id;
  return { version: 1, active, drafts };
}

async function identity(value: unknown) {
  // JSON serialization also preserves distinctions between unpaired UTF-16 code units.
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function selectionIds(raw: string | null) {
  const value = parseJson(raw);
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200))]
    : [];
}

export async function prepareLegacyCapture({ source, raw }: LegacyObservation, original: WorksheetMigration): Promise<LegacyCapture> {
  const id = await identity([source, raw]);
  const entries: LegacyRecoveryEntry[] = [];
  if (source === "legacySelection") {
    const known = new Set(selectionIds(original.legacySelection));
    const ids = selectionIds(raw).filter(question => !known.has(question));
    for (let offset = 0; offset < ids.length; offset += 500) {
      const questions = ids.slice(offset, offset + 500);
      entries.push({
        draft: { id: `${id}-${offset}`, name: "Recovered Question Bank selection", format: defaultFormat,
          entries: questions.map(question => ({ id: question, breakBefore: false })) },
        receipts: await Promise.all(questions.map(question => identity(["selection", question]))),
      });
    }
  } else {
    const migrated = salvageBackup(parseJson(original.collection)) ?? salvageBackup(parseJson(original.recovery));
    const known = new Map(migrated?.drafts.map(draft => [draft.id, JSON.stringify(draft)]));
    const changed = salvageBackup(parseJson(raw))?.drafts.filter(draft => known.get(draft.id) !== JSON.stringify(draft)) ?? [];
    entries.push(...await Promise.all(changed.map(async draft => ({ draft, receipts: [await identity(["draft", draft])] }))));
  }
  return { snapshot: { id, source, entries, acknowledged: false }, raw };
}

export function outstandingRecoveryEntry(entry: LegacyRecoveryEntry, recovered: ReadonlySet<string>): LegacyRecoveryEntry | undefined {
  const receipts = entry.receipts.filter(receipt => !recovered.has(receipt));
  if (!receipts.length) return undefined;
  if (receipts.length === entry.receipts.length) return entry;
  return { receipts, draft: { ...entry.draft, entries: entry.draft.entries.filter((_, index) => !recovered.has(entry.receipts[index])) } };
}
