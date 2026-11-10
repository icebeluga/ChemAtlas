/* eslint-disable @typescript-eslint/no-explicit-any -- Cloudflare Worker bindings are injected at runtime by Wrangler. */
import { env } from "cloudflare:workers";
import { authenticateReviewRequest } from "@/lib/cloudflare-access.mjs";

export const runtime = "edge";
type RouteContext = { params: Promise<{ folder: string; filename: string }> };

async function serve(request: Request, context: RouteContext, headOnly: boolean) {
  const runtimeEnv = env as unknown as Record<string, any>;
  const auth = await authenticateReviewRequest(request, runtimeEnv);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  const { folder, filename } = await context.params;
  const isStimulus = folder.startsWith("_stimulus-");
  const entityId = isStimulus ? folder.slice("_stimulus-".length) : folder;
  const match = filename.match(/^([a-zA-Z0-9_-]{1,64})-segment-([1-9][0-9]*)\.png$/);
  if (!match || !/^[a-zA-Z0-9_-]{1,160}$/.test(entityId) || !runtimeEnv.REVIEW_IMAGES) return new Response(null, { status: 404 });
  const object = await runtimeEnv.REVIEW_IMAGES.get(`owners/${auth.user.id}/${isStimulus ? "question-images/_stimuli" : "question-images"}/${entityId}/${filename}`);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({ "content-type": "image/png", "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
  if (object.size) headers.set("content-length", String(object.size));
  if (headOnly) return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}

export async function GET(request: Request, context: RouteContext) { return serve(request, context, false); }
export async function HEAD(request: Request, context: RouteContext) { return serve(request, context, true); }
