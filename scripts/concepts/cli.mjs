#!/usr/bin/env node
// ChemAtlas concept classification CLI. Run `node scripts/concepts/cli.mjs help`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaxonomy, catalogTopics, createResolver, sha256 } from "../../lib/concepts/taxonomy.mjs";
import { buildConceptGraph } from "../../lib/concepts/graph.mjs";
import { createContentContext, questionContent } from "../../lib/concepts/content.mjs";
import { candidateConcepts } from "../../lib/concepts/candidates.mjs";
import { validateResult, upsertRecord, applyReview, staleness, emptyStore } from "../../lib/concepts/records.mjs";
import { compareClassifications, scoreAgainstReference } from "../../lib/concepts/evaluate.mjs";
import { buildConceptIndex, VERIFIED, PROVISIONAL } from "../../lib/concepts/search.mjs";
import { renderReviewSheet } from "../../lib/concepts/review-sheet.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const PATHS = {
  catalog: "public/student-questions.json",
  stimuli: "research/stimuli.json",
  cropReview: "research/crop-visual-review.json",
  researchJson: "research/concept-taxonomy/ChemAtlas_AP_Chemistry_Concept_Taxonomy.json",
  researchMd: "research/concept-taxonomy/ChemAtlas_AP_Chemistry_Concept_Research.md",
  source: "research/concepts/concepts.v1.source.json",
  taxonomy: "research/concepts/taxonomy.v1.json",
  graph: "research/concepts/concept-graph.json",
  store: "research/concepts/classifications.json",
  runs: "research/concepts/runs",
  index: "research/concepts/concept-index.json",
  prompts: "research/concepts/prompts",
};
const abs = p => join(ROOT, p);
export const readJson = p => JSON.parse(readFileSync(abs(p), "utf8"));
const writeJson = (p, data) => { mkdirSync(dirname(abs(p)), { recursive: true }); writeFileSync(abs(p), JSON.stringify(data, null, 2) + "\n"); };
const rel = p => p.replace(/\\/g, "/");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); args[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true); }
    else args._.push(a);
  }
  return args;
}

function loadAll() {
  const catalog = readJson(PATHS.catalog);
  const taxonomy = readJson(PATHS.taxonomy);
  const ctx = createContentContext({ catalog, stimuli: readJson(PATHS.stimuli), cropReview: readJson(PATHS.cropReview) });
  return { catalog, taxonomy, ctx, resolver: createResolver(taxonomy), topicIds: new Set(catalogTopics(catalog).keys()), store: existsSync(abs(PATHS.store)) ? readJson(PATHS.store) : emptyStore() };
}

const unitOf = q => (q.primaryTopic ? `u${q.primaryTopic.split(".")[0]}` : q.primaryUnit);
const rank = (id, seed) => sha256(`${seed}:${id}`);

// Filters shared by select and prepare: --ids a,b  --unit u2  --topic 2.7  --type MCQ|FRQ  --limit N
function selectQuestions(catalog, args) {
  let qs = catalog.questions;
  if (args.ids) { const ids = String(args.ids).split(","); qs = ids.map(id => catalog.questions.find(q => q.id === id) ?? { missing: id }); }
  if (args.unit) qs = qs.filter(q => unitOf(q) === args.unit);
  if (args.topic) qs = qs.filter(q => (q.relatedTopics ?? []).includes(args.topic));
  if (args.type) qs = qs.filter(q => q.type === args.type);
  return args.limit ? qs.slice(0, Number(args.limit)) : qs;
}

// Deterministic stratified pilot: every unit, MCQ and FRQ, shared stimuli, flagged crops, scans, legacy content.
export function selectPilot(catalog, { seed = "pilot-v1", mcqPerUnit = 5, frqPerUnit = 2 } = {}) {
  const chosen = new Map();
  const take = (rows, n, why) => { for (const q of rows.filter(q => !chosen.has(q.id)).sort((a, b) => rank(a.id, seed).localeCompare(rank(b.id, seed))).slice(0, n)) chosen.set(q.id, why); };
  for (let u = 1; u <= 9; u++) {
    const inUnit = catalog.questions.filter(q => unitOf(q) === `u${u}` && !(q.extractionWarnings ?? []).length);
    take(inUnit.filter(q => q.type === "MCQ" && q.status === "classified"), Math.ceil(mcqPerUnit / 2) + 1, `unit ${u} MCQ (catalog topic reviewed)`);
    take(inUnit.filter(q => q.type === "MCQ" && q.status !== "classified"), Math.floor(mcqPerUnit / 2), `unit ${u} MCQ (catalog topic unreviewed)`);
    take(inUnit.filter(q => q.type === "FRQ" && q.topicParts.length >= 3), frqPerUnit, `unit ${u} multipart FRQ`);
  }
  const stimulusGroups = Object.entries(readJson(PATHS.stimuli).stimuli).slice(0, 3);
  for (const [, g] of stimulusGroups) take(catalog.questions.filter(q => g.questionIds.includes(q.id)), 2, "shared-stimulus MCQ");
  take(catalog.questions.filter(q => (q.extractionWarnings ?? []).some(w => /crop boundary|full source page/i.test(w))), 3, "crop not verified / full page retained");
  take(catalog.questions.filter(q => (q.extractionWarnings ?? []).some(w => /not legible|not located/i.test(w))), 2, "question number not confirmed in OCR");
  take(catalog.questions.filter(q => (q.extractionWarnings ?? []).some(w => /answer\/scoring/i.test(w))), 2, "source is answer/scoring page");
  take(catalog.questions.filter(q => (q.extractionWarnings ?? []).some(w => /diagrams|scanned/i.test(w))), 2, "diagram choices / scanned page");
  take(catalog.questions.filter(q => q.status === "legacy"), 3, "legacy (possibly beyond current AP)");
  take(catalog.questions.filter(q => q.multiConcept && q.type === "MCQ"), 2, "multi-concept MCQ");
  return [...chosen].map(([id, reason]) => ({ id, reason }));
}

function renderImages(jobs, runDir) {
  if (!jobs.length) return;
  const jobFile = join(abs(runDir), "render-job.json");
  writeFileSync(jobFile, JSON.stringify(jobs));
  const r = spawnSync("uv", ["run", "--no-project", "--with", "pymupdf==1.26.6", "python", "-I", abs("scripts/concepts/render_regions.py"), jobFile], { cwd: ROOT, encoding: "utf8" });
  process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "");
  if (r.status !== 0) console.warn("image rendering reported failures; affected questions will need the PDF page instead");
}

function packetFor(content, taxonomy, runDir, catalog) {
  const conceptById = new Map(taxonomy.concepts.map(c => [c.id, c]));
  const images = [];
  content.regions.forEach((r, i) => {
    if (!r.source) return;
    images.push({ kind: r.rect ? "crop" : "full-page", path: rel(`${runDir}/images/${content.questionId}-r${i + 1}.png`), pdf: r.source.pdf, page: r.source.localPage, rect: r.rect, zoom: r.rect ? 2 : 1.4 });
    if (r.rect) images.push({ kind: "page-context", path: rel(`${runDir}/images/${content.questionId}-page${i + 1}.png`), pdf: r.source.pdf, page: r.source.localPage, rect: null, zoom: 1 });
  });
  for (const s of content.stimulus) (s.regions ?? []).forEach((r, i) => {
    const src = catalog.sourceFiles.find(f => `public${f.url}` === `public${s.sourceDocument}`);
    if (src) images.push({ kind: "stimulus", path: rel(`${runDir}/images/${s.id}-${i + 1}.png`), pdf: `public${s.sourceDocument}`, page: r.page - src.from + 1, rect: r.rect, zoom: 2 });
  });
  const candidates = candidateConcepts(content, taxonomy).map(c => {
    const k = conceptById.get(c.conceptId);
    return { conceptId: k.id, name: k.name, definition: k.definition, include: k.include, exclude: k.exclude, whyCandidate: c.reasons };
  });
  return { ...content, images: images.map(({ zoom, ...i }) => i), candidates, _jobs: images };
}

const commands = {
  "build-taxonomy"(args) {
    const research = readJson(PATHS.researchJson);
    const researchHashes = Object.fromEntries([PATHS.researchJson, PATHS.researchMd].map(p => [p, sha256(readFileSync(abs(p)))]));
    const { taxonomy, errors, warnings } = buildTaxonomy({ source: readJson(PATHS.source), research, catalog: readJson(PATHS.catalog), researchHashes });
    for (const w of warnings) console.warn(w);
    if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; return; }
    const methods = {};
    for (const m of Object.values(taxonomy.microConceptMap)) methods[m.method] = (methods[m.method] ?? 0) + 1;
    console.log(`taxonomy ${taxonomy.taxonomyVersion} (${taxonomy.taxonomyHash}): ${taxonomy.concepts.length} concepts, ${taxonomy.skills.length} skills; micro-label mapping ${JSON.stringify(methods)}`);
    if (args["dry-run"]) return;
    writeJson(PATHS.taxonomy, taxonomy);
    commands["build-graph"]();
  },

  "build-graph"() {
    const store = existsSync(abs(PATHS.store)) ? readJson(PATHS.store) : null;
    const graph = buildConceptGraph({ taxonomy: readJson(PATHS.taxonomy), catalog: readJson(PATHS.catalog), store });
    writeJson(PATHS.graph, graph);
    console.log(`concept graph: ${graph.nodes.length} nodes, ${graph.links.length} links -> ${PATHS.graph}`);
  },

  // select-pilot --run pilot-v1  (writes runs/<run>/selection.json)
  "select-pilot"(args) {
    const run = args.run ?? "pilot-v1";
    const selection = selectPilot(readJson(PATHS.catalog), { seed: run });
    writeJson(`${PATHS.runs}/${run}/selection.json`, { run, createdAt: new Date().toISOString(), questions: selection });
    console.log(`${selection.length} questions selected -> ${PATHS.runs}/${run}/selection.json`);
  },

  // prepare --run pilot-v1 [--ids ..|--unit ..|--topic ..|--type ..] [--skip-classified] [--dry-run]
  prepare(args) {
    const { catalog, taxonomy, ctx, store } = loadAll();
    const run = args.run ?? "pilot-v1", runDir = `${PATHS.runs}/${run}`;
    const ids = args.ids || args.unit || args.topic || args.type ? selectQuestions(catalog, args).map(q => q.id ?? q.missing) : readJson(`${runDir}/selection.json`).questions.map(q => q.id);
    const packets = [], skipped = [], missing = [];
    for (const id of ids) {
      if (!ctx.byId.has(id)) { missing.push(id); continue; }
      const content = questionContent(id, ctx);
      const cur = store.records[id]?.current;
      if (args["skip-classified"] && cur && !["rejected"].includes(cur.reviewStatus) && !staleness(cur, content, taxonomy).length) { skipped.push(id); continue; }
      packets.push(packetFor(content, taxonomy, runDir, catalog));
    }
    console.log(`${packets.length} packets, ${skipped.length} skipped (current and not stale), ${missing.length} unknown ids${missing.length ? ": " + missing.join(", ") : ""}`);
    if (args["dry-run"]) return;
    mkdirSync(abs(`${runDir}/packets`), { recursive: true });
    for (const p of packets) { const { _jobs, ...packet } = p; writeJson(`${runDir}/packets/${p.questionId}.json`, packet); }
    renderImages(packets.flatMap(p => p._jobs.map(j => ({ pdf: abs(j.pdf), page: j.page, rect: j.rect, zoom: j.zoom, out: abs(j.path) }))), runDir);
    writeJson(`${runDir}/manifest.json`, { run, taxonomyVersion: taxonomy.taxonomyVersion, taxonomyHash: taxonomy.taxonomyHash, preparedAt: new Date().toISOString(), questionIds: packets.map(p => p.questionId) });
  },

  // ingest --run pilot-v1 --pass a [--model claude-opus-5-5] [--prompt classifier.v1] [--dry-run] [--force]
  ingest(args) {
    const { taxonomy, ctx, resolver, topicIds, store } = loadAll();
    const run = args.run ?? "pilot-v1", pass = args.pass ?? "a", dir = `${PATHS.runs}/${run}/results-${pass}`;
    const method = { engine: args.engine ?? "claude-code-subagent", model: args.model ?? "claude-opus-5-5", role: `classifier-pass-${pass}`, runId: run };
    const promptVersion = args.prompt ?? "classifier.v1";
    const report = { run, pass, accepted: [], blocked: [], invalid: [], kept: [] };
    for (const file of readdirSync(abs(dir)).filter(f => f.endsWith(".json")).sort()) {
      let result;
      try { result = JSON.parse(readFileSync(abs(`${dir}/${file}`), "utf8")); } catch (e) { report.invalid.push({ questionId: file, errors: [`not valid JSON: ${e.message}`] }); continue; }
      const content = ctx.byId.has(result.questionId) ? questionContent(result.questionId, ctx) : null;
      const { record, errors, warnings } = validateResult(result, { content, taxonomy, topicIds, resolver, method, promptVersion });
      if (!record) { report.invalid.push({ questionId: result.questionId ?? file, errors }); continue; }
      // Only pass a becomes the stored record; later passes are validated here and compared with `compare`.
      const w = args["dry-run"] || pass !== "a" ? { written: true } : upsertRecord(store, record, { force: !!args.force });
      if (!w.written) report.kept.push({ questionId: record.questionId, reason: w.reason });
      else (record.reviewStatus === "blocked" ? report.blocked : report.accepted).push({ questionId: record.questionId, reviewStatus: record.reviewStatus, warnings });
    }
    console.log(`pass ${pass}: ${report.accepted.length} classified, ${report.blocked.length} blocked by content, ${report.invalid.length} failed validation, ${report.kept.length} kept`);
    for (const i of report.invalid) console.log(`  INVALID ${i.questionId}: ${i.errors.join("; ")}`);
    if (args["dry-run"]) return;
    writeJson(`${PATHS.runs}/${run}/ingest-${pass}.json`, report);
    if (pass === "a") { writeJson(PATHS.store, store); commands["build-graph"](); }
  },

  // compare --run pilot-v1 --pass b : second independent pass; agreement -> machine_reviewed, disagreement -> needs_attention
  compare(args) {
    const { taxonomy, ctx, resolver, topicIds, store } = loadAll();
    const run = args.run ?? "pilot-v1", pass = args.pass ?? "b", dir = `${PATHS.runs}/${run}/results-${pass}`;
    const rows = [];
    for (const file of readdirSync(abs(dir)).filter(f => f.endsWith(".json")).sort()) {
      const result = JSON.parse(readFileSync(abs(`${dir}/${file}`), "utf8"));
      const content = ctx.byId.has(result.questionId) ? questionContent(result.questionId, ctx) : null;
      const { record } = validateResult(result, { content, taxonomy, topicIds, resolver, method: { role: `pass-${pass}` }, promptVersion: "classifier.v1" });
      const entry = store.records[result.questionId];
      if (!record || !entry?.current) { rows.push({ questionId: result.questionId, agreement: "not-comparable" }); continue; }
      const cmp = compareClassifications(entry.current, record);
      rows.push({ questionId: result.questionId, ...cmp });
      const cur = entry.current;
      if (args["dry-run"] || !["machine_generated", "needs_attention"].includes(cur.reviewStatus)) continue;
      if (cmp.agreement === "agree" && cur.reviewStatus === "machine_generated") applyReview(store, cur.questionId, { decision: "machine-agree", notes: `independent pass ${pass} agreed` });
      else if (cmp.agreement !== "agree") {
        if (cur.reviewStatus === "machine_generated") applyReview(store, cur.questionId, { decision: "flag", notes: `pass ${pass} disagreed: ${cmp.summary}` });
        entry.current.flags = [...new Set([...entry.current.flags, "second-pass-disagreement"])];
      }
    }
    const count = k => rows.filter(r => r.agreement === k).length;
    console.log(`compare pass ${pass}: agree ${count("agree")}, partial ${count("partial")}, disagree ${count("disagree")}, not comparable ${count("not-comparable")}`);
    if (args["dry-run"]) return;
    writeJson(`${PATHS.runs}/${run}/compare-${pass}.json`, rows);
    writeJson(PATHS.store, store);
  },

  // evaluate --run pilot-v1 --reference research/concepts/benchmark/reference-pilot-v1.json [--pass a]
  evaluate(args) {
    const run = args.run ?? "pilot-v1";
    const reference = readJson(args.reference ?? `research/concepts/benchmark/reference-${run}.json`);
    const { store } = loadAll();
    const records = Object.fromEntries(Object.values(store.records).map(e => [e.current.questionId, e.current]));
    const score = scoreAgainstReference(records, reference);
    console.log(JSON.stringify(score.summary, null, 2));
    if (!args["dry-run"]) writeJson(`${PATHS.runs}/${run}/evaluation.json`, score);
  },

  // review --file decisions.json : [{questionId, decision: approve|reject|flag|edit, reviewer, notes, parts?}]
  review(args) {
    const { store, resolver } = loadAll();
    const decisions = JSON.parse(readFileSync(resolve(args.file), "utf8"));
    for (const d of decisions) {
      const unknown = (d.parts ?? []).flatMap(p => ["primary", "supporting", "contextual"].flatMap(r => (p[r] ?? []).map(a => a.conceptId))).filter(id => !resolver.concepts.has(id));
      if (unknown.length) { console.error(`${d.questionId}: unknown concept ids ${unknown.join(", ")}; decision skipped`); process.exitCode = 1; continue; }
      try { const r = applyReview(store, d.questionId, d); console.log(`${d.questionId} -> ${r.reviewStatus}`); }
      catch (e) { console.error(`${d.questionId}: ${e.message}`); process.exitCode = 1; }
    }
    if (!args["dry-run"]) { writeJson(PATHS.store, store); commands["build-graph"](); }
  },

  // review-sheet --run pilot-v1 : standalone HTML for human review (images load from the run's local images folder)
  "review-sheet"(args) {
    const { taxonomy, store } = loadAll();
    const run = args.run ?? "pilot-v1", runDir = `${PATHS.runs}/${run}`;
    const ids = readJson(`${runDir}/manifest.json`).questionIds;
    const records = ids.map(id => store.records[id]?.current).filter(Boolean);
    const packets = Object.fromEntries(ids.map(id => [id, readJson(`${runDir}/packets/${id}.json`)]));
    const comparisons = existsSync(abs(`${runDir}/compare-b.json`)) ? Object.fromEntries(readJson(`${runDir}/compare-b.json`).map(c => [c.questionId, c])) : {};
    writeFileSync(abs(`${runDir}/review-sheet.html`), renderReviewSheet({ run, records, packets, comparisons, taxonomy, imageBase: "images/" }));
    console.log(`${records.length} questions -> ${runDir}/review-sheet.html`);
  },

  // status : counts by review status and stale records (content or concept definition changed)
  status() {
    const { taxonomy, ctx, store } = loadAll();
    const by = {}, stale = [];
    for (const { current: r } of Object.values(store.records)) {
      by[r.reviewStatus] = (by[r.reviewStatus] ?? 0) + 1;
      const reasons = staleness(r, ctx.byId.has(r.questionId) ? questionContent(r.questionId, ctx) : null, taxonomy);
      if (reasons.length) stale.push(`${r.questionId}: ${reasons.join(", ")}`);
    }
    console.log(`records: ${Object.keys(store.records).length} ${JSON.stringify(by)}\nstale: ${stale.length}${stale.length ? "\n  " + stale.join("\n  ") : ""}`);
  },

  // export-index [--provisional] [--out path] : verified-only by default
  "export-index"(args) {
    const { taxonomy, catalog, ctx, store } = loadAll();
    const isStale = r => staleness(r, ctx.byId.has(r.questionId) ? questionContent(r.questionId, ctx) : null, taxonomy).length > 0;
    const index = buildConceptIndex({ store, taxonomy, catalog, include: args.provisional ? PROVISIONAL : VERIFIED, isStale });
    const out = args.out ?? (args.provisional ? "research/concepts/concept-index.provisional.json" : PATHS.index);
    writeJson(out, index);
    console.log(`${index.questionCount} questions indexed (${index.includedStatuses.join(", ")}) -> ${out}`);
  },

  help() {
    console.log(`Commands:\n${Object.keys(commands).map(c => `  ${c}`).join("\n")}\nSee docs/concept-classification/README.md.`);
  },
};

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const name = args._.shift() ?? "help";
  if (!commands[name]) { console.error(`unknown command ${name}`); commands.help(); process.exitCode = 2; return; }
  await commands[name](args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
export { commands, ROOT };
