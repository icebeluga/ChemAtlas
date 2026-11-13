import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const source = JSON.parse(readFileSync(new URL("../wrangler.student.jsonc", import.meta.url), "utf8"));
function check(config, label) {
  assert.equal(config.name, "chematlas-student-private", `${label}: unexpected Worker name`);
  assert.equal(config.workers_dev, false, `${label}: workers.dev must be disabled`);
  assert.equal(config.preview_urls, false, `${label}: previews must be disabled`);
  assert.equal(config.assets?.binding, "ASSETS", `${label}: expected ASSETS binding`);
  assert.equal(config.assets?.run_worker_first, true, `${label}: all asset requests must run Worker first`);
  assert.ok(!config.routes && !config.route, `${label}: public routes are forbidden`);
  assert.ok(!config.d1_databases?.length && !config.r2_buckets?.length, `${label}: no review storage bindings`);
}
check(source, "source");
const builtPath = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));
if (!existsSync(builtPath)) {
  assert.ok(!process.argv.includes("--built"), "Run pnpm run build before checking the deployment artifact.");
  console.log("Student source configuration is private; no built artifact to inspect.");
} else {
  const built = JSON.parse(readFileSync(builtPath, "utf8"));
  check(built, "built artifact");
  assert.ok(built.assets.directory, "Built Wrangler config must include an asset directory.");
  const assetRoot = resolve(dirname(builtPath), built.assets.directory);
  assert.equal(assetRoot, fileURLToPath(new URL("../dist/client", import.meta.url)));
  const manifest = JSON.parse(readFileSync(resolve(assetRoot, ".vite/manifest.json"), "utf8"));
  const studentFiles = readdirSync(assetRoot, { recursive: true });
  for (const path of studentFiles) {
    assert.ok(!/(?:^|[\/])(?:admin|review-dashboard|question-review|question-images)(?:[\/.-]|$)/i.test(path),
      `Private review asset in student build: ${path}`);
  }
  assert.ok(!Object.keys(manifest).some(path => path.includes("/admin/")), "Private route in student manifest.");
  const catalog = JSON.parse(readFileSync(resolve(assetRoot, "questions.json"), "utf8"));
  assert.equal(catalog.units.length, 9);
  assert.ok(catalog.questions.length > 0 && catalog.questions.length === catalog.stats.questions);
  const clientFiles = new Set(Object.values(manifest).flatMap(({ file, css = [], assets = [] }) => [file, ...css, ...assets]));
  for (const file of readdirSync(resolve(assetRoot, "_next/static"), { recursive: true })) {
    if (file.endsWith(".css")) clientFiles.add(`_next/static/${file}`);
  }
  assert.ok([...clientFiles].some((file) => file?.endsWith(".js")), "Missing client JavaScript.");
  assert.ok([...clientFiles].some((file) => file?.endsWith(".css")), "Missing client CSS.");
  for (const file of [
    ...clientFiles,
    "curriculum-topics.json",
    "pdf.worker.min.mjs",
    "worksheet-sources.json",
    "worksheet-content.json",
    "worksheet-fragments.pdf",
    ...catalog.sourceFiles.map(({ url }) => url.replace(/^\//, "")),
  ]) {
    assert.ok(statSync(resolve(assetRoot, file)).size > 0, `Empty deployment asset: ${file}`);
  }
  console.log(`Verified private Wrangler config, ${clientFiles.size} client assets, and ${catalog.questions.length} questions across ${catalog.units.length} units.`);
}
