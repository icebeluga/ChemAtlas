#!/usr/bin/env node
// ChemAtlas concept classification CLI. Run `node scripts/concepts/cli.mjs help`.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTaxonomy, catalogTopics, createResolver, sha256 } from "../../lib/concepts/taxonomy.mjs";
import { buildConceptGraph } from "../../lib/concepts/graph.mjs";
import { createContentContext, questionContent, sourcePageRef } from "../../lib/concepts/content.mjs";
import { candidateConcepts } from "../../lib/concepts/candidates.mjs";
import { validateResult, upsertRecord, applyReview, staleness, emptyStore, applyConventionDecisions } from "../../lib/concepts/records.mjs";
import { compareClassifications, scoreAgainstReference, humanReference } from "../../lib/concepts/evaluate.mjs";
import { buildConceptIndex, VERIFIED, PROVISIONAL } from "../../lib/concepts/search.mjs";
import { renderReviewSheet } from "../../lib/concepts/review-sheet.mjs";
import { pilotStats, cropWorklist } from "../../lib/concepts/report.mjs";
import { completenessFlags, questionMarkdown, claudeView, conceptsMarkdown, conventionsMarkdown, correctionsMarkdown } from "../../lib/concepts/review-package.mjs";
import { validateAiReview, aiReviewToReference } from "../../lib/concepts/ai-review.mjs";

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
  supplements: "research/concepts/content-supplements.json",
  conventions: "research/concepts/conventions.json",
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
  const ctx = createContentContext({ catalog, stimuli: readJson(PATHS.stimuli), cropReview: readJson(PATHS.cropReview), supplements: existsSync(abs(PATHS.supplements)) ? readJson(PATHS.supplements) : null });
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
    images.push({ kind: r.role ?? (r.rect ? "crop" : "full-page"), path: rel(`${runDir}/images/${content.questionId}-r${i + 1}.png`), pdf: r.source.pdf, page: r.source.localPage, rect: r.rect, zoom: r.rect ? 2 : 1.4 });
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

// Result files of a run folder, optionally limited with --ids a,b (so re-running one question does not re-ingest the rest).
const resultFiles = (dir, args) => readdirSync(abs(dir)).filter(f => f.endsWith(".json") && (!args.ids || String(args.ids).split(",").includes(f.slice(0, -5)))).sort();

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

  // ingest --run pilot-v1 --pass a [--ids a,b] [--model claude-opus-5-5] [--prompt classifier.v1] [--dry-run] [--force]
  ingest(args) {
    const { taxonomy, ctx, resolver, topicIds, store } = loadAll();
    const run = args.run ?? "pilot-v1", pass = args.pass ?? "a", dir = `${PATHS.runs}/${run}/results-${pass}`;
    const method = { engine: args.engine ?? "claude-code-subagent", model: args.model ?? "claude-opus-5-5", role: `classifier-pass-${pass}`, runId: run };
    const promptVersion = args.prompt ?? "classifier.v1";
    const report = { run, pass, accepted: [], blocked: [], invalid: [], kept: [] };
    for (const file of resultFiles(dir, args)) {
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

  // compare --run pilot-v1 --pass b [--ids a,b] : second independent pass; agreement -> machine_reviewed, disagreement -> needs_attention
  compare(args) {
    const { taxonomy, ctx, resolver, topicIds, store } = loadAll();
    const run = args.run ?? "pilot-v1", pass = args.pass ?? "b", dir = `${PATHS.runs}/${run}/results-${pass}`;
    const rows = [];
    for (const file of resultFiles(dir, args)) {
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
    const file = `${PATHS.runs}/${run}/compare-${pass}.json`;
    // With --ids, keep the rows of questions that were not re-compared.
    const kept = args.ids && existsSync(abs(file)) ? readJson(file).filter(r => !rows.some(x => x.questionId === r.questionId)) : [];
    writeJson(file, [...kept, ...rows].sort((x, y) => x.questionId.localeCompare(y.questionId)));
    writeJson(PATHS.store, store);
  },

  // build-reference --run pilot-v1 [--set adjudication|holdout] --kind "..." : assemble adjudicator outputs into a reference file
  // adjudication = judged two blinded proposals (reference-<run>.json); holdout = blind, no proposals seen (holdout-reference-<run>.json)
  "build-reference"(args) {
    if (args["from-review"]) {
      // --from-review: questions a named human approved or edited -> benchmark/human-reference-<run>.json
      const run = args.run ?? "pilot-v1", { store } = loadAll();
      const ids = readJson(`${PATHS.runs}/${run}/manifest.json`).questionIds;
      const ref = { ...humanReference(store, ids), createdAt: new Date().toISOString() };
      if (!Object.keys(ref.questions).length) { console.log("no human-verified records yet; nothing written"); return; }
      const strata = ["adjudication", "holdout"].map(s => `research/concepts/benchmark/${s}-${run}.key.json`).filter(p => existsSync(abs(p))).map(readJson);
      for (const [id, q] of Object.entries(ref.questions)) q.stratum = strata.find(k => k[id])?.[id].stratum;
      const out = `research/concepts/benchmark/human-reference-${run}.json`;
      writeJson(out, ref);
      console.log(`${Object.keys(ref.questions).length} human-reviewed questions (${ref.referenceKind}) -> ${out}`);
      return;
    }
    const run = args.run ?? "pilot-v1", set = args.set ?? "adjudication", dir = `research/concepts/benchmark/${set}-${run}/out`;
    const key = readJson(`research/concepts/benchmark/${set}-${run}.key.json`);
    const questions = {}, verdicts = [];
    for (const f of resultFiles(dir, args)) {
      const o = readJson(`${dir}/${f}`);
      questions[o.questionId] = { contentStatus: o.contentStatus, parts: o.parts ?? {}, stratum: key[o.questionId]?.stratum, notes: o.notes ?? "" };
      // Un-blind the verdicts: X/Y -> pass a/b.
      if (set === "adjudication") for (const side of ["X", "Y"]) verdicts.push({ questionId: o.questionId, pass: key[o.questionId][side], label: o[`verdict${side}`]?.label, reason: o[`verdict${side}`]?.reason });
    }
    const kind = set === "holdout" ? "model-adjudicated blind (claude-opus-5-5, prompt adjudicator.blind.v1, no proposals seen); NOT human-verified" : "model-adjudicated (claude-opus-5-5, prompt adjudicator.v1); NOT human-verified";
    const out = set === "adjudication" ? `research/concepts/benchmark/reference-${run}.json` : `research/concepts/benchmark/${set}-reference-${run}.json`;
    writeJson(out, { referenceKind: args.kind ?? kind, createdAt: new Date().toISOString(), questions, ...(verdicts.length ? { verdicts } : {}) });
    console.log(`${Object.keys(questions).length} reference questions -> ${out}`);
  },

  // evaluate --run pilot-v1 [--reference file] [--pass a|b|c|v] [--conventions] [--tag name] : precision/recall overall and per stratum
  // --conventions leaves the concepts of undecided boundary cases (research/concepts/conventions.json) out of the score.
  evaluate(args) {
    const run = args.run ?? "pilot-v1", pass = args.pass ?? "a";
    // --reference accepts a comma-separated list; later files add questions (the two pilot sets do not overlap).
    const refs = String(args.reference ?? `research/concepts/benchmark/reference-${run}.json`).split(",").map(readJson);
    const reference = { referenceKind: [...new Set(refs.map(r => r.referenceKind))].join(" + "), questions: Object.assign({}, ...refs.map(r => r.questions)) };
    const { store, taxonomy, ctx, resolver, topicIds } = loadAll();
    let records;
    if (pass === "a") records = Object.fromEntries(Object.values(store.records).map(e => [e.current.questionId, e.current]));
    else {
      records = {};
      const dir = `${PATHS.runs}/${run}/results-${pass}`;
      for (const f of readdirSync(abs(dir)).filter(f => f.endsWith(".json"))) {
        const res = readJson(`${dir}/${f}`);
        const { record } = validateResult(res, { content: ctx.byId.has(res.questionId) ? questionContent(res.questionId, ctx) : null, taxonomy, topicIds, resolver, method: { role: `pass-${pass}` }, promptVersion: "classifier.v1" });
        if (record) records[record.questionId] = record;
      }
    }
    const subset = s => ({ ...reference, questions: Object.fromEntries(Object.entries(reference.questions).filter(([, q]) => q.stratum === s)) });
    const ignore = args.conventions ? readJson("research/concepts/conventions.json").conventions.filter(c => c.status !== "decided").flatMap(c => c.affects) : [];
    const score = scoreAgainstReference(records, reference, { ignore });
    const strata = Object.fromEntries(["agree", "non-agree"].map(s => [s, scoreAgainstReference(records, subset(s), { ignore }).summary]));
    console.log(JSON.stringify({ pass, overall: score.summary, strata }, null, 2));
    if (!args["dry-run"]) writeJson(`${PATHS.runs}/${run}/evaluation-${pass}${args.tag ? "-" + args.tag : ""}.json`, { reference: args.reference ?? `research/concepts/benchmark/reference-${run}.json`, conventionsExcluded: ignore.length, ...score, strata });
  },

  // report --run pilot-v1 : statistics from stored records + compare/ingest artifacts -> runs/<run>/report.json
  report(args) {
    const { taxonomy, store } = loadAll();
    const run = args.run ?? "pilot-v1", runDir = `${PATHS.runs}/${run}`;
    const opt = p => (existsSync(abs(p)) ? readJson(p) : undefined);
    const ids = readJson(`${runDir}/manifest.json`).questionIds;
    const stats = pilotStats({ records: ids.map(id => store.records[id]?.current).filter(Boolean), comparisons: opt(`${runDir}/compare-b.json`), ingest: opt(`${runDir}/ingest-a.json`), selection: opt(`${runDir}/selection.json`), taxonomy });
    writeJson(`${runDir}/report.json`, stats);
    console.log(JSON.stringify({ processed: stats.processed, byReviewStatus: stats.byReviewStatus, agreement: stats.agreement, cropIssues: stats.cropIssues }, null, 1));
  },

  // crop-issues --run pilot-v1 [--runs a,b] : worklist of crop/content defects for the image-review owner (read-only)
  "crop-issues"(args) {
    const { store } = loadAll();
    const runs = String(args.runs ?? args.run ?? "pilot-v1").split(",");
    const ids = [...new Set(runs.flatMap(r => readJson(`${PATHS.runs}/${r}/manifest.json`).questionIds))];
    const supplements = existsSync(abs(PATHS.supplements)) ? readJson(PATHS.supplements).supplements : {};
    const rows = cropWorklist({ entries: ids.map(id => store.records[id]).filter(Boolean), supplements });
    const by = {}; for (const r of rows) by[r.cropIssue] = (by[r.cropIssue] ?? 0) + 1;
    const out = `${PATHS.runs}/${runs[0]}/crop-issues.json`;
    writeJson(out, { generatedAt: new Date().toISOString(), note: "Found by model classifiers comparing crops with full pages; not human-confirmed. The image-review service was not changed.", counts: by, rows });
    console.log(`${rows.length} questions with crop/diagram problems ${JSON.stringify(by)} -> ${out}`);
  },

  // review --file decisions.json : [{questionId, decision: approve|reject|flag|edit, reviewer, notes, parts?}]
  review(args) {
    const { store, resolver } = loadAll();
    const file = JSON.parse(readFileSync(resolve(args.file), "utf8"));
    // v1: a bare array of decisions; v2: { reviewer, decisions, conventions }
    const decisions = Array.isArray(file) ? file : file.decisions ?? [];
    if (!Array.isArray(file) && file.conventions?.length) {
      try {
        const doc = applyConventionDecisions(readJson(PATHS.conventions), file.conventions, { reviewer: file.reviewer });
        if (!args["dry-run"]) writeJson(PATHS.conventions, doc);
        console.log(`conventions decided by ${file.reviewer}: ${file.conventions.map(c => `${c.id}=${c.decision}`).join(", ")}`);
      } catch (e) { console.error(`conventions: ${e.message}`); process.exitCode = 1; }
    }
    for (const d of decisions) {
      const unknown = (d.parts ?? []).flatMap(p => ["primary", "supporting", "contextual"].flatMap(r => (p[r] ?? []).map(a => a.conceptId))).filter(id => !resolver.concepts.has(id));
      if (unknown.length) { console.error(`${d.questionId}: unknown concept ids ${unknown.join(", ")}; decision skipped`); process.exitCode = 1; continue; }
      try { const r = applyReview(store, d.questionId, d); console.log(`${d.questionId} -> ${r.reviewStatus}`); }
      catch (e) { console.error(`${d.questionId}: ${e.message}`); process.exitCode = 1; }
    }
    if (!args["dry-run"]) { writeJson(PATHS.store, store); commands["build-graph"](); }
  },

  // review-sheet --run pilot-v1 [--runs pilot-v1,pilot-v1-recovered] : standalone HTML for human review, written to the first run's folder.
  // Later runs override packets and second-pass comparisons for the questions they re-ran. Images load from each run's local images folder.
  "review-sheet"(args) {
    const { taxonomy, store } = loadAll();
    const runs = String(args.runs ?? args.run ?? "pilot-v1").split(","), runDir = `${PATHS.runs}/${runs[0]}`;
    const packets = {}, comparisons = {}, ids = [];
    for (const r of runs) {
      const dir = `${PATHS.runs}/${r}`;
      for (const id of readJson(`${dir}/manifest.json`).questionIds) { if (!ids.includes(id)) ids.push(id); packets[id] = readJson(`${dir}/packets/${id}.json`); }
      if (existsSync(abs(`${dir}/compare-b.json`))) for (const c of readJson(`${dir}/compare-b.json`)) comparisons[c.questionId] = c;
    }
    const records = ids.map(id => store.records[id]?.current).filter(Boolean);
    const refFile = `research/concepts/benchmark/reference-${runs[0]}.json`;
    const benchmarkIds = existsSync(abs(refFile)) ? Object.keys(readJson(refFile).questions) : [];
    const conventions = existsSync(abs(PATHS.conventions)) ? readJson(PATHS.conventions).conventions : [];
    const imageSrc = p => rel(relative(abs(runDir), abs(p)));
    writeFileSync(abs(`${runDir}/review-sheet.html`), renderReviewSheet({ run: runs.join("+"), records, packets, comparisons, taxonomy, imageSrc, benchmarkIds, conventions }));
    console.log(`${records.length} questions (${benchmarkIds.length} benchmark first, ${conventions.length} conventions) -> ${runDir}/review-sheet.html`);
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

  // export-review-package --out <dir> [--zip <file.zip>] [--run pilot-v1] : independent-review package for an outside reviewer.
  // Phase-1 material (question images, OCR text, taxonomy, conventions, corrections) is kept apart from Claude's tags (claude/).
  "export-review-package"(args) {
    if (!args.out) throw new Error("--out <dir> is required");
    const { catalog, taxonomy, ctx, store } = loadAll();
    const run = args.run ?? "pilot-v1", out = resolve(args.out);
    if (existsSync(out)) { if (!args.force) throw new Error(`${out} exists; pass --force to rebuild it`); rmSync(out, { recursive: true }); }
    const bench = readJson(`research/concepts/benchmark/reference-${run}.json`), hold = readJson(`research/concepts/benchmark/holdout-reference-${run}.json`);
    const sets = [...Object.keys(bench.questions).map(id => [id, "benchmark"]), ...Object.keys(hold.questions).map(id => [id, "holdout"])];
    const conventions = readJson(PATHS.conventions).conventions, supplements = readJson(PATHS.supplements).supplements;
    const catalogIssues = readJson("research/concepts/catalog-issues.json").issues;
    const names = Object.fromEntries(taxonomy.concepts.map(k => [k.id, k.name]));
    const pageName = src => `images/pages/${src.pdf.split("/").pop().replace(".pdf", "")}-p${String(src.localPage ?? src.page).padStart(3, "0")}.png`;
    const jobs = new Map(), job = (file, pdf, page, rect, zoom) => { if (!jobs.has(file)) jobs.set(file, { pdf: abs(pdf), page, rect, zoom, out: join(out, file) }); return file; };
    const put = (file, data) => { mkdirSync(dirname(join(out, file)), { recursive: true }); writeFileSync(join(out, file), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n"); };
    const manifestQs = [], template = [], claudeIndex = {};
    for (const [id, set] of sets) {
      const content = questionContent(id, ctx), record = store.records[id]?.current, q = ctx.byId.get(id);
      const images = [];
      content.regions.forEach((r, i) => {
        if (!r.source) return;
        const page = pageName(r.source);
        if (r.rect) images.push({ kind: "crop", file: job(`images/crops/${id}-${i + 1}.png`, r.source.pdf, r.source.localPage, r.rect, 2.5), pdf: r.source.pdf, page: r.source.localPage, compiledPage: r.page, rect: r.rect });
        images.push({ kind: "page", role: r.role ?? (r.rect ? "context" : "question-page"), file: job(page, r.source.pdf, r.source.localPage, null, 2), pdf: r.source.pdf, page: r.source.localPage, compiledPage: r.page, rect: null });
      });
      for (const s of content.stimulus) (s.regions ?? []).forEach((r, i) => {
        const src = catalog.sourceFiles.find(f => f.url === s.sourceDocument);
        if (!src) return;
        const pdf = `public${s.sourceDocument}`, local = r.page - src.from + 1;
        images.push({ kind: "stimulus", stimulusId: s.id, file: job(`images/stimuli/${s.id}-${i + 1}.png`, pdf, local, r.rect, 2.5), pdf, page: local, compiledPage: r.page, rect: r.rect });
        const page = pageName({ pdf, localPage: local });
        if (!images.some(x => x.file === page)) images.push({ kind: "page", role: "stimulus-page", file: job(page, pdf, local, null, 2), pdf, page: local, compiledPage: r.page, rect: null });
      });
      const completeness = completenessFlags({ content, record, holdoutRef: set === "holdout" ? hold.questions[id] : null, catalogIssues });
      const entry = {
        questionId: id, set, type: content.type, exam: content.exam, year: content.year, number: content.number,
        catalogTopics: { primary: q.primaryTopic, secondary: q.secondaryTopics ?? [], status: q.status },
        parts: content.parts.map(p => ({ partId: p.partId, label: p.label, catalogTopics: p.catalogTopics ?? [] })),
        questionFile: `questions/${id}/question.md`, images, completeness,
        supplement: content.supplement,
        candidateConcepts: candidateConcepts(content, taxonomy).map(k => k.conceptId),
        claudeClassification: `claude/classifications/${id}.json`,
      };
      manifestQs.push(entry);
      put(entry.questionFile, questionMarkdown({ ...entry, ocrText: content.text }));
      if (record) { put(entry.claudeClassification, claudeView(record, names)); claudeIndex[id] = { file: entry.claudeClassification, concepts: [...new Set(record.parts.flatMap(p => [...p.primary, ...p.supporting, ...p.contextual].map(a => a.conceptId)))] }; }
      template.push({ questionId: id, contentStatus: "", contentIssues: [], independent: { parts: Object.fromEntries(content.parts.map(p => [p.partId, { primary: [], supporting: [], contextual: [], rationale: "" }])) }, confidence: "", comparison: { verdict: "", findings: [] }, changedMindAfterComparison: false, notes: "" });
    }
    renderImages([...jobs.values()], "research/concepts/runs/" + run);
    const missing = [...jobs.values()].filter(j => !existsSync(j.out));
    if (missing.length) throw new Error(`${missing.length} images failed to render: ${missing.slice(0, 5).map(j => j.out).join(", ")}`);
    const concepts = taxonomy.concepts.map(({ id, name, group, scope, definition, include, exclude, examples, topics, aliases, related, prerequisites }) => ({ id, name, group, scope: scope ?? "ap", definition, include, exclude, examples, topics, aliases, related, prerequisites }));
    put("taxonomy/concepts.json", { taxonomyVersion: taxonomy.taxonomyVersion, taxonomyHash: taxonomy.taxonomyHash, groups: taxonomy.groups, concepts, skills: taxonomy.skills });
    put("taxonomy/CONCEPTS.md", conceptsMarkdown(taxonomy));
    put("conventions/conventions.json", { conventions: conventions.map(({ history, ...k }) => k) });
    put("conventions/CONVENTIONS.md", conventionsMarkdown(conventions));
    const pageFile = compiled => { const s = catalog.sourceFiles.find(f => f.from <= compiled && compiled <= f.to); return s ? pageName({ pdf: `public${s.url}`, localPage: compiled - s.from + 1 }) : null; };
    put("corrections/content-supplements.json", { supplements });
    put("corrections/catalog-issues.json", { issues: catalogIssues });
    // Each correction ships with the catalog's original page(s) and the supplied page(s), so the reviewer can check it.
    const originals = {};
    for (const [id, s] of Object.entries(supplements)) {
      const q = ctx.byId.get(id), orig = [...new Set(q.sourceRegions?.length ? q.sourceRegions.map(r => r.page) : q.pages)];
      for (const p of new Set([...orig, ...s.regions.map(r => r.page)])) { const src = sourcePageRef(catalog, p); if (src) job(pageFile(p), src.pdf, src.localPage, null, 2); }
      originals[id] = orig.map(pageFile);
    }
    renderImages([...jobs.values()], "research/concepts/runs/" + run);
    if ([...jobs.values()].some(j => !existsSync(j.out))) throw new Error("correction pages failed to render");
    put("corrections/CORRECTIONS.md", correctionsMarkdown(supplements, catalogIssues, pageFile, originals));
    put("claude/index.json", { note: "Phase 2 only. Claude's stored pass-A classifications (model claude-opus-5-5, prompt classifier.v1). Not human-verified.", questions: claudeIndex });
    put("claude/model-references.json", { note: "Phase 2 only. Reference answers built by Claude adjudicator models. NOT human-verified; another Claude opinion, not an answer key.", benchmark: { referenceKind: bench.referenceKind, questions: bench.questions }, holdout: { referenceKind: hold.referenceKind, questions: hold.questions } });
    put("review-output/gpt6-review-results.template.json", { format: "chematlas-ai-review/v1", reviewer: { model: "GPT-6", interface: "ChatGPT", notes: "" }, reviewedAt: "", questions: template, conventions: conventions.map(k => ({ id: k.id, recommendation: "", proposedRule: "", rationale: "", confidence: "" })), correctionChecks: Object.keys(supplements).map(id => ({ questionId: id, result: "", note: "" })), taxonomyIssues: [], catalogIssues: [], packageIssues: [] });
    for (const name of ["GPT6_REVIEW_INSTRUCTIONS.md", "review-results.schema.json"]) {
      const dest = name.endsWith(".md") ? name : `review-output/${name}`;
      mkdirSync(dirname(join(out, dest)), { recursive: true }); copyFileSync(abs(`research/concepts/review-package/${name}`), join(out, dest));
    }
    const counts = { questions: manifestQs.length, benchmark: manifestQs.filter(m => m.set === "benchmark").length, holdout: manifestQs.filter(m => m.set === "holdout").length, frq: manifestQs.filter(m => m.type === "FRQ").length, parts: manifestQs.reduce((n, m) => n + m.parts.length, 0), images: jobs.size, concepts: concepts.length, conventions: conventions.length, corrections: Object.keys(supplements).length };
    const manifest = { package: "ChemAtlas concept classification: independent review", format: "chematlas-review-package/v1", createdAt: new Date().toISOString(), run, taxonomyVersion: taxonomy.taxonomyVersion, taxonomyHash: taxonomy.taxonomyHash, counts, phases: { phase1: ["questions/", "images/", "taxonomy/", "conventions/", "corrections/"], phase2: ["claude/"] }, questions: manifestQs };
    put("manifest.json", manifest);
    put("README.md", `# ChemAtlas concept classification: independent review package\n\nRead **GPT6_REVIEW_INSTRUCTIONS.md** first, then \`manifest.json\`.\n\n- ${counts.questions} AP Chemistry questions (${counts.benchmark} benchmark, ${counts.holdout} held-out; ${counts.frq} free-response with ${counts.parts} parts in total), with ${counts.images} source images rendered from the original PDFs.\n- ${counts.concepts} concepts, ${counts.conventions} unresolved conventions, ${counts.corrections} proposed page corrections.\n- \`claude/\` holds Claude's classifications. Open it only after classifying a question yourself.\n- Return \`gpt6-review-results.json\` in the format of \`review-output/gpt6-review-results.template.json\`.\n\nNothing here is human-verified. Generated ${manifest.createdAt} from ChemAtlas taxonomy ${taxonomy.taxonomyVersion} (${taxonomy.taxonomyHash}).\n`);
    // Self-check: every referenced file exists, every image is a non-trivial PNG, every Claude concept id is in the taxonomy.
    const problems = [], ids = new Set(concepts.map(k => k.id)), PNG = "89504e470d0a1a0a";
    for (const m of manifestQs) {
      for (const file of [m.questionFile, ...m.images.map(i => i.file)]) {
        if (!existsSync(join(out, file))) { problems.push(`${m.questionId}: missing ${file}`); continue; }
        if (file.endsWith(".png") && (readFileSync(join(out, file)).subarray(0, 8).toString("hex") !== PNG || statSync(join(out, file)).size < 3000)) problems.push(`${m.questionId}: bad image ${file}`);
      }
      if (!m.images.some(i => i.kind === "crop" || i.kind === "page")) problems.push(`${m.questionId}: no question image`);
      if (m.completeness.status === "incomplete") problems.push(`${m.questionId}: classified content is not complete`);
      for (const k of claudeIndex[m.questionId]?.concepts ?? []) if (!ids.has(k)) problems.push(`${m.questionId}: unknown concept ${k}`);
    }
    let bytes = 0; const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : (bytes += statSync(join(d, e.name)).size); }; walk(out);
    console.log(JSON.stringify({ out, counts, cautions: manifestQs.filter(m => m.completeness.status !== "complete").length, megabytes: +(bytes / 1e6).toFixed(1), problems }, null, 1));
    if (problems.length) { process.exitCode = 1; return; }
    if (args.zip) {
      const r = spawnSync("uv", ["run", "--no-project", "python", "-I", abs("scripts/concepts/zip_package.py"), out, resolve(args.zip)], { cwd: ROOT, encoding: "utf8" });
      process.stdout.write(r.stdout ?? ""); process.stderr.write(r.stderr ?? "");
      if (r.status !== 0) process.exitCode = 1;
    }
  },

  // import-ai-review --file results.json[,batch2.json] [--run pilot-v1] [--dry-run] [--force]
  // Stores an independent AI review as research/concepts/ai-reviews/<model>-<run>.json. Never touches classifications.json,
  // never marks anything human_verified, never decides a convention.
  "import-ai-review"(args) {
    if (!args.file) throw new Error("--file is required");
    const { taxonomy, ctx, store } = loadAll();
    const run = args.run ?? "pilot-v1";
    const texts = String(args.file).split(",").map(p => readFileSync(resolve(p), "utf8"));
    const reviews = texts.map(t => JSON.parse(t));
    const models = [...new Set(reviews.map(r => r.reviewer?.model))];
    if (models.length !== 1) throw new Error(`all files must come from one reviewer model, got ${models.join(", ")}`);
    const cat = k => reviews.flatMap(r => r[k] ?? []);
    const merged = { ...reviews[0], questions: cat("questions"), conventions: cat("conventions"), correctionChecks: cat("correctionChecks"), taxonomyIssues: cat("taxonomyIssues"), catalogIssues: cat("catalogIssues"), packageIssues: cat("packageIssues") };
    const ids = [...Object.keys(readJson(`research/concepts/benchmark/reference-${run}.json`).questions), ...Object.keys(readJson(`research/concepts/benchmark/holdout-reference-${run}.json`).questions)];
    const questionParts = new Map(ids.map(id => [id, questionContent(id, ctx).parts]));
    const { errors, warnings } = validateAiReview(merged, { conceptIds: new Set(taxonomy.concepts.map(k => k.id)), questionParts, conventions: readJson(PATHS.conventions).conventions });
    for (const w of warnings) console.warn(`warning: ${w}`);
    if (errors.length) { console.error(errors.map(e => `ERROR ${e}`).join("\n")); process.exitCode = 1; return; }
    const ref = aiReviewToReference(merged, { importedAt: new Date().toISOString(), sourceSha256: sha256(texts.join("\n")) });
    const out = `research/concepts/ai-reviews/${models[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${run}.json`;
    const records = Object.fromEntries(Object.values(store.records).map(e => [e.current.questionId, e.current]));
    const s = scoreAgainstReference(records, ref).summary;
    console.log(`${Object.keys(ref.questions).length} questions reviewed by ${models[0]} (${warnings.length} warnings). Claude pass A vs this review: primary ${s.primary.precision}/${s.primary.recall}, supporting ${s.supporting.precision}/${s.supporting.recall}, any role ${s.anyRole.precision}/${s.anyRole.recall}`);
    if (args["dry-run"]) return;
    if (existsSync(abs(out)) && !args.force) { console.error(`${out} exists; pass --force to replace it (the earlier import stays in git history)`); process.exitCode = 1; return; }
    writeJson(out, ref);
    console.log(`-> ${out} (independent AI review; not human-verified; classifications.json unchanged)`);
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
