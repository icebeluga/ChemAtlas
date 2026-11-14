import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContentContext, questionContent } from "../lib/concepts/content.mjs";
import { applyReview, applyConventionDecisions, emptyStore, upsertRecord } from "../lib/concepts/records.mjs";
import { scoreAgainstReference, humanReference } from "../lib/concepts/evaluate.mjs";
import { cropWorklist } from "../lib/concepts/report.mjs";
import { renderReviewSheet } from "../lib/concepts/review-sheet.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalog = await json("../public/student-questions.json");
const taxonomy = await json("../research/concepts/taxonomy.v1.json");
const supplements = await json("../research/concepts/content-supplements.json");
const conventions = await json("../research/concepts/conventions.json");
const base = { catalog, stimuli: await json("../research/stimuli.json"), cropReview: await json("../research/crop-visual-review.json") };
const plain = createContentContext(base), supplemented = createContentContext({ ...base, supplements });
const conceptIds = new Set(taxonomy.concepts.map(c => c.id));

const tag = id => ({ conceptId: id, evidence: `needs ${id}` });
const part = (partId, primary, supporting = []) => ({ partId, label: partId, primary: primary.map(tag), supporting: supporting.map(tag), contextual: [], actions: ["identify"], representations: ["text-only"], skills: [] });
const record = (questionId, parts, extra = {}) => ({ questionId, contentStatus: "complete", reviewStatus: "needs_attention", parts, flags: [], cropIssue: "none", diagramStatus: "none", officialTopics: { primary: "1.1", additional: [] }, createdAt: "2026-11-14T00:00:00Z", ...extra });

test("content supplements add or replace regions without touching the catalog, and force a visual check", () => {
  const add = questionContent("frq-2011-6-937", supplemented), before = questionContent("frq-2011-6-937", plain);
  assert.equal(add.regions.length, before.regions.length + 1);
  assert.equal(add.regions.at(-1).role, "continuation");
  assert.notEqual(add.contentHash, before.contentHash, "a supplement makes the old record stale");
  const replace = questionContent("mcq-2024-21-2091", supplemented);
  assert.deepEqual(replace.regions.map(r => r.page), [2089]);
  assert.equal(replace.text, "", "catalog text that belongs to another question is withheld");
  assert.equal(replace.readiness.status, "needs-visual-check");
  assert.ok(replace.supplement.catalogCorrection);
  assert.equal(questionContent("mcq-2008-6-31", supplemented).contentHash, questionContent("mcq-2008-6-31", plain).contentHash, "unsupplemented questions keep their hash");
  for (const [id, s] of Object.entries(supplements.supplements)) {
    assert.ok(catalog.questions.some(q => q.id === id), `${id} exists`);
    assert.ok(s.regions.every(r => catalog.sourceFiles.some(f => f.from <= r.page && r.page <= f.to)), `${id} pages exist`);
  }
});

test("scoring counts role swaps and can leave undecided boundary concepts out", () => {
  const ref = { questions: { q1: { contentStatus: "complete", parts: { stem: { primary: ["imf-properties"], supporting: ["hydrogen-bonding"] } } } } };
  const recs = { q1: record("q1", [part("stem", ["imf-properties", "hydrogen-bonding"])]) };
  const strict = scoreAgainstReference(recs, ref).summary;
  assert.equal(strict.roleSwaps, 1);
  assert.equal(strict.primary.fp, 1);
  assert.equal(strict.anyRole.precision, 1, "the concept itself was found");
  const lenient = scoreAgainstReference(recs, ref, { ignore: [{ questionId: "q1", partId: "stem", concepts: ["hydrogen-bonding"] }] }).summary;
  assert.equal(lenient.primary.precision, 1);
  assert.equal(lenient.supporting.tp + lenient.supporting.fn, 0);
});

test("conventions file is well formed and only a named reviewer can decide a convention", () => {
  for (const c of conventions.conventions) {
    assert.equal(c.status, "undecided", `${c.id} must not be pre-decided`);
    assert.ok(Object.keys(c.options).length >= 2);
    for (const id of [...c.concepts, ...c.affects.flatMap(a => a.concepts)]) assert.ok(conceptIds.has(id), `${c.id}: ${id}`);
  }
  const doc = structuredClone(conventions), id = doc.conventions[1].id;
  assert.throws(() => applyConventionDecisions(doc, [{ id, decision: "A" }], {}), /reviewer/);
  assert.throws(() => applyConventionDecisions(doc, [{ id, decision: "Z" }], { reviewer: "T" }), /unknown option/);
  assert.throws(() => applyConventionDecisions(doc, [{ id: "nope", decision: "A" }], { reviewer: "T" }), /unknown convention/);
  applyConventionDecisions(doc, [{ id, decision: "A", notes: "first" }], { reviewer: "T", now: "t1" });
  applyConventionDecisions(doc, [{ id, decision: "B" }], { reviewer: "U", now: "t2" });
  const c = doc.conventions[1];
  assert.equal(c.decision, "B");
  assert.equal(c.decidedBy, "U");
  assert.equal(c.history[0].decidedBy, "T", "a changed decision keeps the earlier one");
});

test("exclude-rule check flags a routine step tagged next to the concept that covers it", async () => {
  const { excludeConflicts } = await import("../lib/concepts/records.mjs");
  const byId = new Map(taxonomy.concepts.map(c => [c.id, c]));
  assert.deepEqual(excludeConflicts(["titration-analysis", "reaction-stoichiometry"], byId), [["reaction-stoichiometry", "titration-analysis"]]);
  assert.deepEqual(excludeConflicts(["gibbs-free-energy", "entropy"], byId), []);
  for (const c of conventions.conventions.filter(c => c.aiRecommendations)) for (const r of c.aiRecommendations) assert.match(r.reviewer, /not a decision/);
});

test("human reference includes only records a named human approved or edited", () => {
  const store = emptyStore();
  for (const id of ["q1", "q2", "q3"]) upsertRecord(store, record(id, [part("stem", ["entropy"])]));
  applyReview(store, "q1", { decision: "approve", reviewer: "Teacher", now: "t" });
  applyReview(store, "q2", { decision: "edit", reviewer: "Teacher", parts: [part("stem", ["gibbs-free-energy"])], now: "t" });
  store.records.q3.current.reviewStatus = "machine_reviewed";
  assert.throws(() => applyReview(store, "q3", { decision: "edit", reviewer: "T", parts: [part("stem", [])] }), /primary/);
  assert.throws(() => applyReview(store, "q3", { decision: "edit", reviewer: "T", parts: [part("stem", ["entropy"], ["entropy"])] }), /more than one role/);
  const ref = humanReference(store, ["q1", "q2", "q3"]);
  assert.deepEqual(Object.keys(ref.questions), ["q1", "q2"]);
  assert.deepEqual(ref.questions.q2.parts.stem.primary, ["gibbs-free-energy"]);
  assert.match(ref.referenceKind, /human-reviewed \(Teacher\)/);
});

test("crop worklist keeps the original defect after a supplemented re-classification", () => {
  const blocked = record("q1", [], { contentStatus: "partial", cropIssue: "missing-content", contentNotes: "continuation missing" });
  const rows = cropWorklist({
    entries: [
      { current: record("q1", [part("stem", ["entropy"])], { cropIssue: "missing-content-recovered-from-page" }), history: [{ record: blocked }] },
      { current: record("q2", [part("stem", ["entropy"])], { cropIssue: "wrong-question" }), history: [] },
      { current: record("q3", [part("stem", ["entropy"])]), history: [] },
    ],
    supplements: { q1: { mode: "add", regions: [{ page: 2 }] } },
  });
  assert.deepEqual(rows.map(r => r.questionId), ["q2", "q1"]);
  assert.equal(rows[1].cropIssue, "missing-content");
  assert.equal(rows[1].nowClassifiable, true);
  assert.deepEqual(rows[1].supplement.pages, [2]);
});

test("review sheet: benchmark first, per-part additions, second-pass suggestions, conventions, escaping", () => {
  const records = [record("mcq-z", [part("stem", ["entropy"])]), record("frq-a", [part("a", ["gibbs-free-energy"]), part("b", ["entropy"], ["<script>"])])];
  const html = renderReviewSheet({
    run: "t", records, taxonomy, imageSrc: p => p, benchmarkIds: ["mcq-z"], conventions: conventions.conventions,
    packets: { "frq-a": { images: [{ kind: "crop", path: "x.png", pdf: "p.pdf", page: 1 }], supplement: { mode: "add", reason: "next page" } } },
    comparisons: { "frq-a": { agreement: "partial", summary: "", parts: [{ partId: "b", b: { primary: ["entropy"], supporting: ["hess-law"] } }] } },
  });
  assert.ok(html.indexOf('data-q="mcq-z"') < html.indexOf('data-q="frq-a"'), "benchmark questions come first");
  assert.match(html, /data-add="frq-a" data-part="a"/);
  assert.match(html, /data-add="frq-a" data-part="b"/);
  assert.match(html, /data-concept="hess-law"[^>]*data-source="b"/);
  assert.doesNotMatch(html, /data-concept="entropy"[^>]*data-source="b"/, "a tag pass A already has is not suggested again");
  assert.match(html, /Content supplement \(add\)/);
  assert.equal((html.match(/<fieldset data-conv=/g) ?? []).length, conventions.conventions.length);
  assert.doesNotMatch(html, /<script>"/);
  assert.match(html, /&lt;script&gt;/);
});
