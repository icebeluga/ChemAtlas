import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";

test("Pages development serves the PDF worker and favicon without exposing protected public assets", { timeout: 30_000 }, async () => {
  const config = {
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_localfixture",
    VITE_CHEMATLAS_CONTENT_PREFIX: "shared/releases/fixture",
  };
  // Vite's configuration loader can retain worker handles on Linux. Keep its
  // lifetime in an owned child so it cannot prevent the Node test worker exiting.
  const server = fork(new URL("./fixtures/pages-dev-server.mjs", import.meta.url), {
    env: { ...process.env, ...config }, stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  try {
    const origin = await new Promise((accept, reject) => {
      server.once("error", reject);
      server.once("exit", () => reject(new Error("Pages test server exited before becoming ready")));
      server.once("message", message => {
        if (message.type === "ready") accept(message.origin);
        else reject(new Error("Pages test server could not start"));
      });
    });
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
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, "exit");
      if (server.connected) server.send({ type: "close" });
      else server.kill();
      const timeout = setTimeout(() => server.kill(), 5000);
      try {
        const [code, signal] = await exited;
        assert.equal(signal, null, "Pages test server did not shut down cleanly");
        assert.equal(code, 0, "Pages test server failed during shutdown");
      } finally { clearTimeout(timeout); }
    }
  }
});
