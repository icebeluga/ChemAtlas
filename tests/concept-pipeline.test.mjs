import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createResolver, catalogTopics } from "../lib/concepts/taxonomy.mjs";
import { createContentContext, questionContent, partIdFromLabel, coverageOf, partCovered } from "../lib/concepts/content.mjs";
import { candidateConcepts } from "../lib/concepts/candidates.mjs";
import { validateResult, upsertRecord, applyReview, staleness, emptyStore, canTransition } from "../lib/concepts/records.mjs";
import { compareClassifications, scoreAgainstReference } from "../lib/concepts/evaluate.mjs";
import { buildConceptIndex, searchQuestions, conceptsForTopic, PROVISIONAL } from "../lib/concepts/search.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalog = await json("../public/student-questions.json");
const taxonomy = await json("../research/concepts/taxonomy.v1.json");
const ctx = createContentContext({ catalog, stimuli: await json("../research/stimuli.json"), cropReview: await json("../research/crop-visual-review.json") });
const resolver = createResolver(taxonomy);
const topicIds = new Set(catalogTopics(catalog).keys());
const method = { engine: "test", model: "none", role: "classifier-pass-a" };
const opts = id => ({ content: ctx.byId.has(id) ? questionContent(id, ctx) : null, taxonomy, topicIds, resolver, method, promptVersion: "classifier.v1", now: "2026-11-14T00:00:00Z" });
const part = (partId, primary, supporting = [], contextual = []) => ({
  partId, primary: primary.map(conceptId => ({ conceptId, evidence: `Solving ${partId} requires ${conceptId}.` })),
  supporting: supporting.map(conceptId => ({ conceptId, evidence: `Necessary step uses ${conceptId}.` })), contextual: contextual.map(conceptId => ({ conceptId })), actions: ["identify"], representations: ["text-only"], skills: [],
});
const result = (questionId, parts, extra = {}) => ({ questionId, contentCheck: { status: "complete", sawImage: true, diagramStatus: "none", cropIssue: "none", notes: "" }, officialTopics: { primary: "8.5", additional: [] }, parts, answerKeyUsed: false, needsAttention: false, ...extra });

const MCQ = "mcq-2008-6-31"; // shared-stimulus MCQ with a verified crop
const FRQ = "frq-2005-1-6"; // six catalog parts (a) ... (e)

test("question content: stimulus, FRQ parts, sources, readiness and content hash", () => {
  const m = questionContent(MCQ, ctx);
  assert.equal(m.stimulus[0].id, "stimulus-2008-mcq-4-6-page31");
  assert.deepEqual(m.parts.map(p => p.partId), ["stem"]);
  assert.equal(m.crop.verified, true);
  assert.equal(m.regions[0].source.pdf, "public/source/bank-01.pdf");
  assert.equal(m.readiness.status, "needs-visual-check"); // it refers to a titration curve
  const f = questionContent(FRQ, ctx);
  assert.deepEqual(f.parts.map(p => p.partId), ["a", "b", "c-i", "c-ii", "d", "e"]);
  assert.equal(partIdFromLabel("(b)(ii)"), "b-ii");
  const answerPage = catalog.questions.find(q => q.extractionWarnings.some(w => /answer\/scoring/.test(w)));
  assert.ok(questionContent(answerPage.id, ctx).readiness.reasons.includes("source-is-answer-or-scoring-page"));
  const changed = createContentContext({ catalog: { ...catalog, questions: catalog.questions.map(q => (q.id === MCQ ? { ...q, fullText: q.fullText + " " } : q)) }, stimuli: { stimuli: ctx.stimuli }, cropReview: { reviews: [] } });
  assert.notEqual(questionContent(MCQ, changed).contentHash, m.contentHash);
  assert.throws(() => questionContent("mcq-does-not-exist", ctx), /unknown question/);
});

test("candidate narrowing is short, explained, and includes catalog-topic concepts", () => {
  const c = candidateConcepts(questionContent(MCQ, ctx), taxonomy);
  assert.ok(c.length > 0 && c.length <= 24);
  assert.ok(c.some(x => x.conceptId === "titration-curves" && x.reasons.includes("catalog-topic-primary")));
  assert.ok(c.every(x => x.reasons.length));
});

test("validation accepts a well-formed MCQ classification and aggregates it", () => {
  const { record, errors } = validateResult(result(MCQ, [part("stem", ["titration-curves"], ["pka-speciation"], ["buffers"])]), opts(MCQ));
  assert.deepEqual(errors, []);
  assert.equal(record.reviewStatus, "machine_generated");
  assert.deepEqual(record.aggregate.primary, ["titration-curves"]);
  assert.deepEqual(record.aggregate.supporting, ["pka-speciation"]);
  assert.deepEqual(record.aggregate.contextual, ["buffers"]);
  assert.equal(record.conceptHashes["titration-curves"], taxonomy.concepts.find(c => c.id === "titration-curves").hash);
  assert.equal(record.conceptHashes.buffers, undefined, "contextual tags do not pin concept hashes");
});

test("validation rejects unknown ids, fabricated keys, missing evidence and unseen visuals", () => {
  const bad = (r, pattern) => { const { record, errors } = validateResult(r, opts(r.questionId)); assert.equal(record, null); assert.ok(errors.some(e => pattern.test(e)), errors.join("; ")); };
  bad(result(MCQ, [part("stem", ["not-a-concept"])]), /unknown concept/);
  bad(result(MCQ, [part("stem", ["titration-curves"])], { answerKeyUsed: true }), /answer key/);
  bad(result(MCQ, [part("stem", ["titration-curves"], ["titration-curves"])]), /assigned twice/);
  bad(result(MCQ, [{ ...part("stem", ["titration-curves"]), primary: [{ conceptId: "titration-curves", evidence: "" }] }]), /evidence/);
  bad(result(MCQ, [part("stem", ["titration-curves"])], { contentCheck: { status: "complete", sawImage: false, diagramStatus: "none" } }), /visual check required/);
  bad(result(MCQ, [part("stem", ["titration-curves"])], { officialTopics: { primary: "10.1", additional: [] } }), /unknown official topic/);
  bad(result(MCQ, [part("x", ["titration-curves"])]), /does not resolve/);
  const { errors } = validateResult({ questionId: "mcq-nope" }, opts("mcq-nope"));
  assert.match(errors[0], /does not resolve to a catalog record/);
});

test("FRQ parts: every catalog part is required, refinements are allowed and flagged", () => {
  const ids = ["a", "b", "c-i", "c-ii", "d", "e"];
  const full = ids.map(id => part(id, ["weak-acid-equilibrium"]));
  assert.deepEqual(validateResult(result(FRQ, full), opts(FRQ)).errors, []);
  const missing = validateResult(result(FRQ, full.slice(1)), opts(FRQ));
  assert.ok(missing.errors.some(e => e.includes("catalog part a ((a)) was not classified")));
  const refined = [part("a-i", ["equilibrium-expression"]), part("a-ii", ["weak-acid-equilibrium"]), ...full.slice(1)];
  const r = validateResult(result(FRQ, refined), opts(FRQ));
  assert.deepEqual(r.errors, []);
  assert.ok(r.record.flags.includes("part-refined"));
  assert.deepEqual(r.record.parts.map(p => p.partId), ["a-i", "a-ii", "b", "c-i", "c-ii", "d", "e"]);
});

test("catalog range labels ('(a)–(c)', '(d onward)', 'all parts') accept the printed parts they cover", () => {
  assert.deepEqual(coverageOf("(a)–(c)"), { kind: "letters", from: "a", to: "c" });
  assert.deepEqual(coverageOf("(d onward)"), { kind: "letters", from: "d", to: "z" });
  assert.deepEqual(coverageOf("(b)(i)–(ii)"), { kind: "letters", from: "b", to: "b" });
  assert.deepEqual(coverageOf("remaining parts"), { kind: "any" });
  assert.equal(partCovered("b-ii", coverageOf("(a–c)")), true);
  assert.equal(partCovered("d", coverageOf("(a–c)")), false);
  const ranged = catalog.questions.find(q => q.topicParts.map(p => p.label).join("|") === "(a)–(b)|(c)|(d onward)");
  assert.ok(ranged, "fixture: an FRQ with ranged catalog parts");
  const r = validateResult(result(ranged.id, ["a", "b", "c", "d", "e"].map(p => part(p, ["reaction-stoichiometry"]))), opts(ranged.id));
  assert.deepEqual(r.errors, []);
  const gap = validateResult(result(ranged.id, ["a", "b", "c"].map(p => part(p, ["reaction-stoichiometry"]))), opts(ranged.id));
  assert.ok(gap.errors.some(e => e.includes("(d onward)")), "an uncovered range is still reported");
});

test("incomplete content is stored as blocked with no concept associations", () => {
  const { record } = validateResult(result(MCQ, [], { contentCheck: { status: "partial", sawImage: true, diagramStatus: "unreadable", cropIssue: "missing-content", notes: "graph cut off" } }), opts(MCQ));
  assert.equal(record.reviewStatus, "blocked");
  assert.deepEqual(record.parts, []);
  assert.equal(record.aggregate, null);
  assert.ok(record.flags.includes("crop-issue:missing-content"));
});

test("review transitions, history, human edits and staleness", () => {
  const store = emptyStore();
  const { record } = validateResult(result(MCQ, [part("stem", ["titration-curves"])]), opts(MCQ));
  upsertRecord(store, record);
  assert.equal(canTransition("rejected", "human_verified"), false);
  assert.throws(() => applyReview(store, MCQ, { decision: "approve" }), /reviewer/);
  applyReview(store, MCQ, { decision: "machine-agree" });
  assert.equal(store.records[MCQ].current.reviewStatus, "machine_reviewed");
  applyReview(store, MCQ, { decision: "approve", reviewer: "teacher" });
  assert.equal(store.records[MCQ].current.reviewStatus, "human_verified");
  assert.equal(upsertRecord(store, record).written, false, "machine output must not overwrite a human-verified record");
  const edited = applyReview(store, MCQ, { decision: "edit", reviewer: "teacher", parts: [part("stem", ["titration-curves"], ["pka-speciation"])] });
  assert.deepEqual(edited.aggregate.supporting, ["pka-speciation"]);
  assert.equal(store.records[MCQ].history.length, 3);
  applyReview(store, MCQ, { decision: "reject", reviewer: "teacher" });
  assert.throws(() => applyReview(store, MCQ, { decision: "approve", reviewer: "teacher" }), /cannot move/);
  assert.equal(upsertRecord(store, record).written, true, "a rejected record can be reclassified");
  assert.equal(store.records[MCQ].history.at(-1).record.reviewStatus, "rejected");
  // staleness
  const content = questionContent(MCQ, ctx);
  assert.deepEqual(staleness(record, content, taxonomy), []);
  assert.deepEqual(staleness(record, { ...content, contentHash: "different" }, taxonomy), ["content-changed"]);
  const revised = { ...taxonomy, concepts: taxonomy.concepts.map(c => (c.id === "titration-curves" ? { ...c, hash: "0000000000000000" } : c)) };
  assert.deepEqual(staleness(record, content, revised), ["concept-changed:titration-curves"]);
  assert.deepEqual(staleness(record, content, { ...taxonomy, concepts: taxonomy.concepts.filter(c => c.id !== "titration-curves") }), ["concept-removed:titration-curves"]);
});

test("second-pass comparison and precision/recall scoring", () => {
  const a = validateResult(result(MCQ, [part("stem", ["titration-curves"], ["pka-speciation"])]), opts(MCQ)).record;
  const b = validateResult(result(MCQ, [part("stem", ["titration-curves"], ["pka-speciation"])]), opts(MCQ)).record;
  const c = validateResult(result(MCQ, [part("stem", ["buffers"])]), opts(MCQ)).record;
  assert.equal(compareClassifications(a, b).agreement, "agree");
  assert.equal(compareClassifications(a, c).agreement, "disagree");
  const p = (partId, primary) => ({ partId, primary: primary.map(conceptId => ({ conceptId })), supporting: [] });
  const printed = { contentStatus: "complete", parts: [p("a", ["entropy"]), p("b", ["gibbs-free-energy"])] };
  const coarse = { contentStatus: "complete", parts: [p("a–b", ["entropy", "gibbs-free-energy"])] };
  assert.notEqual(compareClassifications(printed, coarse).agreement, "disagree", "a coarse catalog range part is compared with the printed parts it covers");
  const ref = { referenceKind: "test", questions: { [MCQ]: { contentStatus: "complete", parts: { stem: { primary: ["titration-curves"], supporting: ["pka-speciation", "buffers"] } } } } };
  const s = scoreAgainstReference({ [MCQ]: a }, ref).summary;
  assert.equal(s.primary.precision, 1);
  assert.equal(s.primary.recall, 1);
  assert.equal(s.supporting.precision, 1);
  assert.equal(s.supporting.recall, 0.5);
});

test("concept search: verified-only by default, AND/OR, cross-topic, no contextual matches, live counts", () => {
  const store = emptyStore();
  const add = (id, parts, topic, status) => {
    const { record, errors } = validateResult(result(id, parts, { officialTopics: { primary: topic, additional: [] } }), opts(id));
    assert.deepEqual(errors, [], id);
    upsertRecord(store, { ...record, reviewStatus: status });
  };
  const frqParts = ["a", "b", "c-i", "c-ii", "d", "e"].map(p => part(p, ["weak-acid-equilibrium"], p === "c-ii" ? ["henderson-hasselbalch"] : []));
  add(MCQ, [part("stem", ["titration-curves"], ["pka-speciation"], ["formal-charge"])], "8.5", "human_verified");
  add(FRQ, frqParts, "8.3", "human_verified");
  add("mcq-2008-1-29", [part("stem", ["ionization-energy"], ["pka-speciation"])], "1.7", "machine_generated");
  const verified = buildConceptIndex({ store, taxonomy, catalog });
  assert.equal(verified.questionCount, 2);
  assert.deepEqual(searchQuestions(verified, { concepts: ["pka-speciation"] }), [MCQ]);
  assert.deepEqual(searchQuestions(verified, { concepts: ["formal-charge"] }), [], "contextual tags never match");
  assert.deepEqual(searchQuestions(verified, { concepts: ["titration-curves", "weak-acid-equilibrium"], mode: "any" }), [FRQ, MCQ].sort());
  assert.deepEqual(searchQuestions(verified, { concepts: ["titration-curves", "weak-acid-equilibrium"], mode: "all" }), []);
  assert.deepEqual(searchQuestions(verified, { concepts: ["weak-acid-equilibrium"], type: "MCQ" }), []);
  assert.deepEqual(searchQuestions(verified, { concepts: ["henderson-hasselbalch"], role: "primary" }), []);
  assert.deepEqual(verified.questions[FRQ].parts.find(p => p.partId === "c-ii").concepts, ["weak-acid-equilibrium", "henderson-hasselbalch"]);
  const provisional = buildConceptIndex({ store, taxonomy, catalog, include: PROVISIONAL });
  assert.deepEqual(searchQuestions(provisional, { concepts: ["pka-speciation"] }), ["mcq-2008-1-29", MCQ].sort(), "a concept spans units 1 and 8");
  assert.equal(provisional.concepts["pka-speciation"].questionIds.length, 2);
  assert.deepEqual(searchQuestions(provisional, { concepts: ["pka-speciation"], unit: "u1" }), ["mcq-2008-1-29"]);
  assert.ok(conceptsForTopic(verified, "8.5").some(c => c.id === "titration-curves" && c.count === 1));
  const stale = buildConceptIndex({ store, taxonomy, catalog, isStale: r => r.questionId === MCQ });
  assert.equal(stale.questionCount, 1, "stale records are excluded");
});
