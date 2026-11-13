import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const name = process.argv[2];
assert.match(name ?? "", /^chematlas-student-stage6-[a-z0-9-]{1,32}$/);
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
assert.equal(config.name, "chematlas-student-private");
assert.equal(config.main, "index.js");
assert.equal(config.workers_dev, false);
assert.equal(config.preview_urls, false);
assert.deepEqual(config.assets, { binding: "ASSETS", run_worker_first: true, directory: "../client" });
assert.ok(!config.routes && !config.route && !config.d1_databases?.length && !config.r2_buckets?.length
  && !config.services?.length && !Object.keys(config.vars ?? {}).length);
writeFileSync("dist/server/wrangler.stage6.json", JSON.stringify({
  ...config, name, topLevelName: name,
}, null, 2) + "\n", { flag: "wx" });
