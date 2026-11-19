import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { createServer } from "vite";

test("Pages development serves the PDF worker and favicon without exposing protected public assets", async () => {
  const config = {
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_localfixture",
    VITE_CHEMATLAS_CONTENT_PREFIX: "shared/releases/fixture",
  };
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  let server;
  try {
    server = await createServer({
      configFile: resolve("vite.pages.config.ts"),
      server: { host: "127.0.0.1", port: 0, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: "error",
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}/ChemAtlas/`;
    for (const [name, type] of [["pdf.worker.min.mjs", "text/javascript"], ["favicon.svg", "image/svg+xml"]]) {
      const response = await fetch(`${origin}${name}?v=regression`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), type);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(resolve("public", name)));
      const head = await fetch(`${origin}${name}`, { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal((await head.arrayBuffer()).byteLength, 0);
      assert.equal((await fetch(`${origin}${name}`, { method: "POST" })).status, 405);
    }
    for (const name of ["student-questions.json", "worksheet-content.json", "worksheet-fragments.pdf", "source/bank-01.pdf"]) {
      const response = await fetch(`${origin}${name}`);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.match(await response.text(), /<html/i);
    }
  } finally {
    await server?.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
