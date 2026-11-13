import handler from "vinext/server/fetch-handler";
import { authenticateStudentRequest, isRestrictedStudentPath } from "../lib/student-access.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    // Never place review routes or administrative APIs on the student deployment.
    if (isRestrictedStudentPath(new URL(request.url).pathname)) {
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

    const response = await handler.fetch(request, env, ctx);
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
