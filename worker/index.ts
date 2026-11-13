import handler from "vinext/server/fetch-handler";
import { authenticateStudentRequest, isRestrictedStudentPath } from "../lib/student-access.mjs";

type StudentEnv = Cloudflare.Env & { ASSETS: Fetcher };

const worker = {
  async fetch(request: Request, env: StudentEnv, ctx: ExecutionContext): Promise<Response> {
    // Never place review routes or administrative APIs on the student deployment.
    const { pathname } = new URL(request.url);
    if (isRestrictedStudentPath(pathname)) {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }

    // With Workers Static Assets, ctx.access may be absent behind the asset
    // router. Verify the signed Access JWT instead; deny every missing or
    // misconfigured auth context before Vinext or any asset handler is reached.
    const access = await authenticateStudentRequest(
      request,
      env as unknown as Record<string, unknown>,
    );
    if (!access.ok) {
      return new Response(access.error, {
        status: access.status,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      });
    }

    // With Worker-first routing, Vinext can return 404 for its generated
    // client bundles even when they are present in the Workers asset manifest.
    const response = (request.method === "GET" || request.method === "HEAD")
      && pathname.startsWith("/_next/static/")
      ? await env.ASSETS.fetch(request)
      : await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default worker;
