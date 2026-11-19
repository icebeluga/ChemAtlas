import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("the UI-only Vite config refuses builds and excludes Worker dependencies", () => {
  const config = readFileSync(new URL("../vite.ui.config.ts", import.meta.url), "utf8");
  assert.match(config, /if\s*\(command\s*===\s*"build"\)\s*\{\s*throw\b/);
  assert.doesNotMatch(config, /@cloudflare\/vite-plugin|wrangler|student-access|cloudflare-access/i);
});

test("production and release commands cannot select the UI-only Vite config", () => {
  const manifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  assert.equal(JSON.parse(manifest).scripts.build, "vite build");
  assert.doesNotMatch(manifest, /vite\.ui\.config/);
  for (const directory of [".github", "scripts"]) {
    const entries = readdirSync(new URL(`../${directory}/`, import.meta.url), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const path = join(entry.parentPath, entry.name);
      assert.doesNotMatch(readFileSync(path, "utf8"), /vite\.ui\.config/, path);
    }
  }
});
