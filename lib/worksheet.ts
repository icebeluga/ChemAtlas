import { z } from "zod";
import { originalSourcePages } from "./question-source";
import type { QuestionSource, Region } from "./question-source";

export const steps = ["Select", "Arrange", "Format", "Export PDF"] as const;
export const formats = ["questions", "answers", "combined"] as const;
export type ExportMode = (typeof formats)[number];
export type { Region, SourceFile } from "./question-source";
export type Printable = { pages: Region[]; exam?: string; answer?: string };
export type Registry = { questions: Record<string, Printable>; references: number[]; answerKeyPage: number };
export function worksheetSource(question: QuestionSource & { id: string }, registry?: Registry) {
  const approved = registry?.questions[question.id];
  if (approved?.pages.length && (!question.sourceBank || question.sourceBank === "mega")) {
    return { ...approved, fullPages: false };
  }
  return {
    pages: [...new Set(originalSourcePages(question))].map(page => ({ page, rect: [] })),
    fullPages: true, answer: undefined, exam: undefined,
  };
}

export const formatSchema = z.object({
  title: z.string().max(100), subtitle: z.string().max(120),
  paper: z.enum(["Letter", "A4"]), landscape: z.boolean(),
  margin: z.number().min(24).max(72), font: z.number().min(9).max(16),
  gap: z.number().min(4).max(36), lines: z.number().int().min(0).max(12),
  name: z.boolean(), date: z.boolean(), classField: z.boolean(),
  numbering: z.boolean(), citations: z.boolean(), pageNumbers: z.boolean(), references: z.boolean(),
  grouping: z.enum(["none", "type", "topic"]),
  mcqTitle: z.string().max(80), frqTitle: z.string().max(80), instructions: z.string().max(320),
  mcqInstructions: z.string().max(240).default(""), frqInstructions: z.string().max(240).default(""),
});
const entrySchema = z.object({ id: z.string().min(1).max(200), breakBefore: z.boolean(), lines: z.number().int().min(0).max(12).optional() });
export const draftSchema = z.object({
  id: z.string().min(1).max(100), name: z.string().max(100),
  format: formatSchema, entries: z.array(entrySchema).max(500),
}).refine(d => new Set(d.entries.map(e => e.id)).size === d.entries.length, "A worksheet cannot contain duplicate questions.");
export const backupSchema = z.object({ version: z.literal(1), active: z.string(), drafts: z.array(draftSchema).max(100) })
  .refine(b => new Set(b.drafts.map(d => d.id)).size === b.drafts.length && b.drafts.some(d => d.id === b.active));
export type Format = z.infer<typeof formatSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Backup = z.infer<typeof backupSchema>;

export const defaultFormat: Format = {
  title: "AP Chemistry Practice", subtitle: "", paper: "Letter", landscape: false,
  margin: 36, font: 11, gap: 16, lines: 3, name: true, date: true, classField: false,
  numbering: true, citations: false, pageNumbers: true, references: false,
  grouping: "type", mcqTitle: "Multiple choice", frqTitle: "Free response", instructions: "", mcqInstructions: "", frqInstructions: "",
};

export const presets = [
  { name: "Standard Practice Worksheet", format: {}, type: "all" },
  { name: "AP Chemistry MCQ Practice", format: { title: "AP Chemistry MCQ Practice", lines: 0 }, type: "MCQ" },
  { name: "AP Chemistry FRQ Practice", format: { title: "AP Chemistry FRQ Practice", lines: 6 }, type: "FRQ" },
  { name: "Mixed Practice Examination", format: { title: "AP Chemistry Practice Examination", classField: true, lines: 5 }, type: "all" },
  { name: "Compact Review Sheet", format: { title: "AP Chemistry Review", margin: 28, gap: 6, lines: 0, grouping: "none" as const }, type: "all" },
];

export function newWorksheetId(): string {
  // getRandomValues is also available in the HTTP development preview.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function newDraft(name = "Untitled worksheet"): Draft {
  return { id: newWorksheetId(), name, format: { ...defaultFormat }, entries: [] };
}

export function addEntries(draft: Draft, ids: string[]): Draft {
  const seen = new Set(draft.entries.map(e => e.id));
  const entries = [...draft.entries];
  for (const id of ids) {
    if (seen.has(id) || entries.length >= 500) continue;
    seen.add(id);
    entries.push({ id, breakBefore: false });
  }
  return entries.length === draft.entries.length ? draft : { ...draft, entries };
}

export const worksheetStorageKey = "chematlas-worksheets-v1";
