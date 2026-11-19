import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { assertPagesArtifact } from "../scripts/pages/assert-artifact.mjs";

test("artifact gate rejects disguised question text and unexpected protected files", async () => {
  const parent = resolve("outputs");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(resolve(parent, "pages-artifact-test-"));
  assert(root.startsWith(parent + sep));
  try {
    await mkdir(resolve(root, "practice-builder"), { recursive: true });
    await mkdir(resolve(root, "assets"));
    for (const name of ["index.html", "practice-builder/index.html", "404.html", ".nojekyll", "pdf.worker.min.mjs", "favicon.svg", "favicon.png"]) await writeFile(resolve(root, name), "fixture");
    const catalog = JSON.parse(await readFile("public/student-questions.json", "utf8"));
    const text = catalog.questions.find(q => q.textPreview?.length > 70).textPreview;
    await writeFile(resolve(root, "assets/data.js"), `export default ${JSON.stringify(text)}`);
    await assert.rejects(assertPagesArtifact(root), /Question text embedded/);
    await writeFile(resolve(root, "assets/data.js"), "export default 1");
    await writeFile(resolve(root, "student-questions.json"), "{}");
    await assert.rejects(assertPagesArtifact(root), /Unexpected Pages file/);
  } finally {
    assert(root.startsWith(parent + sep));
    await rm(root, { recursive: true, force: true });
  }
});
