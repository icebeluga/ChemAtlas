import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
import { PDFDocument } from "pdf-lib";

// Compile the production TypeScript composer without a browser. Each test
// supplies a tiny raster page and records the exact source regions requested.
const output = await build({
  stdin: {
    contents: 'export { composeWorksheet } from "./lib/worksheet-pdf"; export { addEntries, backupSchema, newDraft } from "./lib/worksheet";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { addEntries, backupSchema, composeWorksheet, newDraft } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalog = (await read("../public/questions.json")).questions;
const registry = await read("../public/worksheet-sources.json");
const content = await read("../public/worksheet-content.json");
const fragments = () => readFile(new URL("../public/worksheet-fragments.pdf", import.meta.url));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWw0AAAAASUVORK5CYII=", "base64");
const groupIds = ["mcq-2008-1-29", "mcq-2008-2-29", "mcq-2008-3-29"];
const makeDraft = ids => addEntries(newDraft(), ids);

test("worksheet drafts deduplicate selections and validate active draft and limits", () => {
  const first = makeDraft([groupIds[0], groupIds[0]]);
  const second = makeDraft([groupIds[1]]);
  const backup = { version: 1, active: second.id, drafts: [first, second] };
  assert.equal(first.entries.length, 1);
  assert.ok(backupSchema.safeParse(backup).success);
  assert.ok(!backupSchema.safeParse({ ...backup, active: "missing" }).success);
  assert.ok(!backupSchema.safeParse({ ...backup, drafts: [first, second, second] }).success);
});

test("fallback renders a shared source page once and retains multi-page FRQ order", async () => {
  const body = catalog.filter(q => groupIds.includes(q.id));
  const frq = { id: "uploaded", pages: [2, 3], sourceBank: "local-test", type: "FRQ", number: 1, exam: "Fixture", source: "Fixture" };
  const rendered = [];
  const bytes = await composeWorksheet(makeDraft([...groupIds, frq.id]), [...body, frq], registry, "questions",
    { questions: {}, contexts: {} }, fragments, async (region, q) => {
      rendered.push([q.sourceBank || "mega", region.page, region.rect]);
      return { png, width: 612, height: 792 };
    });
  assert.deepEqual(rendered, [["mega", 29, []], ["local-test", 2, []], ["local-test", 3, []]]);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 3);
});

test("a reviewed 2008 set deduplicates printable shared context and supports a single member", async () => {
  for (const ids of [groupIds, [groupIds[1]]]) {
    const bytes = await composeWorksheet(makeDraft(ids), catalog, registry, "questions", content, fragments,
      () => { throw new Error("Reviewed print fixture unexpectedly used a source page"); });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
  }
});

test("answer-only exports require at least one verified registry answer", async () => {
  const q = catalog.find(q => q.id.startsWith("frq-") && !registry.questions[q.id]?.answer);
  await assert.rejects(composeWorksheet(makeDraft([q.id]), catalog, registry, "answers", content, fragments,
    () => { throw new Error("Answer-only export rendered an unverified page"); }), /no verified answers/);
});
