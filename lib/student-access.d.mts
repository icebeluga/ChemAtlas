export type StudentAccessResult =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; status: number; error: string };
export declare function authenticateStudentRequest(
  request: Request, env: Record<string, unknown>, now?: number,
): Promise<StudentAccessResult>;
export declare function isRestrictedStudentPath(pathname: string): boolean;
export declare function clearStudentAccessKeyCacheForTests(): void;
