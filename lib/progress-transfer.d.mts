export type ProgressAttempt = {
  attempts: number; wrong: number; correct: number; last: string;
  history: Array<{ date: string; result: "correct" | "missed" | "unsure" }>;
};
export type ProgressSnapshot = {
  progress: Record<string, ProgressAttempt>;
  overrides: Record<string, string>;
  sessions: number;
};
export declare const PROGRESS_FORMAT: string;
export declare const PROGRESS_VERSION: number;
export declare function serializeProgress(data: ProgressSnapshot): string;
export declare function parseProgress(text: string): ProgressSnapshot;
