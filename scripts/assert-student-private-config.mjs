import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
const source = JSON.parse(readFileSync(new URL("../wrangler.student.jsonc", import.meta.url), "utf8"));
function check(config, label) {
  assert.equal(config.name, "chematlas-student-private", `${label}: unexpected Worker name`);
  assert.equal(config.workers_dev, false, `${label}: workers.dev must be disabled`);
  assert.equal(config.preview_urls, false, `${label}: previews must be disabled`);
  assert.equal(config.assets?.run_worker_first, true, `${label}: all asset requests must run Worker first`);
  assert.ok(!config.routes && !config.route, `${label}: public routes are forbidden`);
  assert.ok(!config.d1_databases?.length && !config.r2_buckets?.length, `${label}: no review storage bindings`);
}
check(source, "source");
const builtPath = new URL("../dist/server/wrangler.json", import.meta.url);
if (existsSync(builtPath)) {
  check(JSON.parse(readFileSync(builtPath, "utf8")), "built artifact");
  console.log("Student source and built Wrangler configurations remain private.");
} else console.log("Student source configuration is private; no built artifact to inspect.");
