import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { addEntries, backupSchema, defaultFormat, draftSchema } from "../lib/worksheet";
import type { Draft, Registry, SourceFile } from "../lib/worksheet";
import type { WorksheetContent } from "../lib/worksheet-content";
import type { WorksheetQuestion } from "../lib/worksheet-pdf";
import { renderWorksheet } from "../lib/worksheet-render";

const require = createRequire(import.meta.url);
const pdfRequire = createRequire(require.resolve("pdfjs-dist/package.json"));
const { createCanvas, DOMMatrix, ImageData, Path2D } = pdfRequire("@napi-rs/canvas");
Object.assign(globalThis, { DOMMatrix, ImageData, Path2D, document: {
  createElement(tag: string) {
    assert.equal(tag, "canvas");
    const canvas = createCanvas(1, 1);
    canvas.toBlob = (done: (blob: Blob) => void) => done(new Blob([canvas.toBuffer("image/png")], { type: "image/png" }));
    return canvas;
  },
} });
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const root = new URL("../public/", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("questions.json", root), "utf8")) as {
  questions: WorksheetQuestion[]; sourceFiles: SourceFile[];
};
const registry = JSON.parse(await readFile(new URL("worksheet-sources.json", root), "utf8")) as Registry;
const docs = new Map<string, ReturnType<typeof pdfjs.getDocument>["promise"]>();
const visited: number[] = [];
async function open(url?: string, bankId?: string) {
  assert(!bankId);
  assert(url);
  let cached = docs.get(url);
  if (!cached) {
    const data = new Uint8Array(await readFile(new URL(url.slice(1), root)));
    const assets = new URL("./", `file://${require.resolve("pdfjs-dist/package.json")}`);
    cached = pdfjs.getDocument({ data, standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", assets)) }).promise;
    docs.set(url, cached);
  }
  const original = await cached;
  return new Proxy(original, {
    get(target, key) {
      if (key !== "getPage") return Reflect.get(target, key, target);
      return (n: number) => {
        visited.push(catalog.sourceFiles.find(f => f.url === url)!.from + n - 1);
        return target.getPage(n);
      };
    },
  });
}

const content = JSON.parse(await readFile(new URL("worksheet-content.json", root), "utf8")) as WorksheetContent;
const fragments = new Uint8Array(await readFile(new URL("worksheet-fragments.pdf", root)));
const sourceDoc = await PDFDocument.load(fragments);
const ids = new Set(catalog.questions.map(q => q.id));
for (const [id, item] of Object.entries(content.questions)) {
  assert(ids.has(id));
  assert(item.blocks.length);
  if (item.context) assert(content.contexts[item.context]?.length);
}
for (const block of [...Object.values(content.questions).flatMap(q => q.blocks), ...Object.values(content.contexts).flat()]) {
  if (block.kind !== "region") continue;
  const box = sourceDoc.getPage(block.fragment).getCropBox();
  assert(Math.abs(box.width - (block.rect[2] - block.rect[0])) < .05);
  assert(Math.abs(box.height - (block.rect[3] - block.rect[1])) < .05);
}

function draftFor(title: string, questionIds: string[], format: Partial<Draft["format"]> = {}) {
  return addEntries({ id: "qa", name: title, entries: [], format: {
    ...defaultFormat, title, grouping: "none", lines: 0, gap: 10, ...format,
  } }, questionIds);
}
const render = (draft: Draft, mode: "questions" | "answers" | "combined" = "questions") => renderWorksheet(
  draft, catalog.questions, registry, mode, catalog.sourceFiles, open, new AbortController().signal, content, async () => fragments,
);
async function readPages(bytes: Uint8Array) {
  const review = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= review.numPages; i++) {
    const p = await review.getPage(i);
    pages.push((await p.getTextContent()).items.map(item => "str" in item ? item.str : "").join(" "));
  }
  return pages;
}

const shared = await render(draftFor("Shared Reaction MCQ", ["mcq-2008-17-32"]));
const sharedPages = await readPages(shared);
assert.equal(sharedPages.length, 1);
assert.match(sharedPages[0], /following reactions/);
assert.match(sharedPages[0], /synthesis reaction/);
assert.doesNotMatch(sharedPages[0], /A precipitation reaction|coordination complex|entropy changes/);

const tenIds = ["mcq-2014-40-187", "mcq-2002-47-616", "mcq-1994-21-680", "mcq-2013-19-959", "mcq-2016-2-1053",
  "mcq-2018-20-1202", "mcq-2019-3-1303", "mcq-2012-18-1354", "mcq-2022-2-1617", "mcq-2023-6-1720"];
const tenDraft = draftFor("Compact MCQ Worksheet", [...tenIds, tenIds[0]]);
assert.equal(tenDraft.entries.length, 10);
assert(draftSchema.safeParse(tenDraft).success);
assert(backupSchema.safeParse({ version: 1, active: "qa", drafts: [tenDraft] }).success);
const ten = await render(tenDraft);
const tenPages = await readPages(ten);
assert(tenPages.length <= 3 && tenPages.length > 1);
assert.deepEqual(tenPages.flatMap(text => [...text.matchAll(/Question (\d+)/g)].map(match => +match[1])), Array.from({ length: 10 }, (_, i) => i + 1));
assert.match(tenPages.join(" "), /thermodynamically favorable/);
assert.doesNotMatch(tenPages.join(" "), /Scan to open/);

const complex = await render(draftFor("Kinetics Free Response", ["frq-2005-3-8"], { lines: 4 }));
const complexPages = await readPages(complex);
assert(complexPages.length <= 3 && complexPages.length >= 2);
const frqText = complexPages.join(" ");
for (const expected of ["initial-rate experiments", "specific rate constant", "experimental data", "Label the vertical axis", "uncatalyzed first-order"]) assert(frqText.includes(expected), expected);
assert.doesNotMatch(frqText, /turn to the other part|Copyright/);
assert.deepEqual(visited, [], "Questions should come from bounded fragments, never from original pages at export.");

const mixed = await render(draftFor("Mixed Practice", ["mcq-2018-23-2039", "frq-2005-7-13"], {
  paper: "A4", landscape: true, citations: true, references: true, lines: 2,
}), "combined");
const mixedDocument = await PDFDocument.load(mixed);
assert.equal(Math.round(mixedDocument.getPage(0).getWidth()), 842);
assert.equal(Math.round(mixedDocument.getPage(0).getHeight()), 595);
assert.deepEqual(visited, [439, 440, 441]);
assert.match((await readPages(mixed)).at(-1)!, /1\.\s+C/);
const answerDraft = draftFor("Key", ["mcq-2018-23-2039"]);
const separateKey = await PDFDocument.load(await render(answerDraft, "answers"));
assert.equal(separateKey.getPageCount(), 1);
await assert.rejects(render(draftFor("Unreviewed", ["frq-2022-1-427"])), /first cited page begins question 3/);
assert(!content.questions["mcq-2013-24-959"], "A detached equation needs visual review.");

const expansion = await render(draftFor("Catalog Integration QA", [
  "mcq-2008-1-29", "mcq-2008-4-31", "mcq-2008-13-32", "frq-2006-7-27",
  "frq-2021-7-413", "frq-2022-3-427", "frq-2023-2-445", "frq-2024-4-474",
]));
const expansionPages = await readPages(expansion);
for (const expected of ["Noble gases", "moles of the added strong", "entropy changes", "potential energy diagram", "specific heat capacity"]) {
  assert(expansionPages.join(" ").includes(expected), expected);
}
assert.doesNotMatch(expansionPages.join(" "), /GO ON TO THE NEXT PAGE|Answer key|Are always radioactive/);
assert.deepEqual(visited, [439, 440, 441], "The expanded worksheet must use bounded question regions.");
await assert.rejects(render(draftFor("Missing", ["missing"])), /missing from this catalog/);
await assert.rejects(render(draftFor("No answers", ["frq-2005-3-8"]), "answers"), /no verified answers/);

const start = performance.now();
const large = await render(draftFor("Large Worksheet", Object.keys(content.questions).slice(0, 60)));
const ms = Math.round(performance.now() - start);
console.log(`Verified shared MCQ (${sharedPages.length} page), 10 MCQs (${tenPages.length} pages), multipart FRQ (${complexPages.length} pages), and mixed export. 60-question Node generation: ${ms} ms, ${large.length} bytes.`);

if (process.argv[2]) {
  const out = process.argv[2];
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/ChemAtlas-Catalog-Integration-QA.pdf`, expansion);
  await writeFile(`${out}/ChemAtlas-Shared-Reaction-MCQ.pdf`, shared);
  await writeFile(`${out}/ChemAtlas-Compact-MCQ-Worksheet.pdf`, ten);
  await writeFile(`${out}/ChemAtlas-Kinetics-Free-Response.pdf`, complex);
}
