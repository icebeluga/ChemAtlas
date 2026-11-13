/** Content authored or reviewed against the original question, independent of page layout. */
export type ContentBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "choices"; choices: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "region"; fragment: number; page: number; rect: number[] };

export type QuestionContent = { blocks: ContentBlock[]; context?: string };
export type WorksheetContent = {
  questions: Record<string, QuestionContent>;
  review?: Record<string, string>;
  contexts: Record<string, ContentBlock[]>;
};
