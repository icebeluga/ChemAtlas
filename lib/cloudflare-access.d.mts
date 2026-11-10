export type ReviewIdentity = { id: string; email: string; name: string };
export type ReviewAccessResult =
  | { ok: true; user: ReviewIdentity }
  | { ok: false; status: number; error: string };
export function authenticateReviewRequest(request: Request, env: Record<string, unknown>, now?: number): Promise<ReviewAccessResult>;
export function clearAccessKeyCacheForTests(): void;
