import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { contentFiles } from "./content-manifest.mjs";

export async function assertPagesArtifact(directory = "dist-pages") {
  const root = resolve(directory);
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const paths = files.filter(file => file.isFile()).map(file => relative(root, resolve(file.parentPath, file.name)).replaceAll("\\", "/"));
  for (const required of ["index.html", "practice-builder/index.html", "404.html", ".nojekyll", "pdf.worker.min.mjs", "favicon.svg", "favicon.png"]) {
    assert(paths.includes(required), `Missing public asset: ${required}`);
  }
  const protectedBytes = await Promise.all([...contentFiles.map(path => `public/${path}`), "research/stimuli.json"].map(path => readFile(path)));
  const catalog = JSON.parse(await readFile("public/student-questions.json", "utf8"));
  const probes = catalog.questions.map(q => q.textPreview).filter(text => text?.length > 70).map(text => text.slice(0, 100));
  for (const path of paths) {
    assert(/^(?:(?:index|404)\.html|practice-builder\/index\.html|favicon\.(?:svg|png)|pdf\.worker\.min\.mjs|\.nojekyll|application-sha\.txt|assets\/[\w.-]+\.(?:js|css))$/.test(path), `Unexpected Pages file: ${path}`);
    const bytes = await readFile(resolve(root, path));
    for (const source of protectedBytes) assert(!bytes.equals(source), `Protected source copied into Pages: ${path}`);
    const text = bytes.toString("utf8");
    if (path === "application-sha.txt") assert(/^[a-f0-9]{40}\n$/.test(text), "Invalid artifact source SHA");
    assert(!/sb_secret_[A-Za-z0-9_-]+|(?:postgres(?:ql)?:\/\/)|SUPABASE_SERVICE_ROLE_KEY|PRIVATE KEY-----/.test(text), `Secret marker in ${path}`);
    assert(!/question-review\/|\/api\/admin\/|research\/stimuli\.json/.test(text), `Private module in ${path}`);
    for (const probe of probes) assert(!text.includes(probe) && !text.includes(JSON.stringify(probe).slice(1, -1)), `Question text embedded in ${path}`);
    if (path.endsWith(".html")) {
      assert(!/(?:src|href)="\/(?!ChemAtlas\/)/.test(text), `Incorrect root asset path in ${path}`);
    }
  }
  console.log(`Pages privacy check passed: ${paths.length} explicitly allowed public files; no protected source or question text.`);
  return paths;
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/pages/assert-artifact.mjs")) await assertPagesArtifact(process.argv[2]);
