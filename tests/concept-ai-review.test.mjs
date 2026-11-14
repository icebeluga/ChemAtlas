import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createContentContext, questionContent } from "../lib/concepts/content.mjs";
import { validateAiReview, aiReviewToReference, AI_REVIEW_FORMAT } from "../lib/concepts/ai-review.mjs";
import { completenessFlags, questionMarkdown, conceptsMarkdown } from "../lib/concepts/review-package.mjs";
import { scoreAgainstReference } from "../lib/concepts/evaluate.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const catalog = await json("../public/student-questions.json");
const taxonomy = await json("../research/concepts/taxonomy.v1.json");
const conventions = (await json("../research/concepts/conventions.json")).conventions;
const ctx = createContentContext({ catalog, stimuli: await json("../research/stimuli.json"), cropReview: await json("../research/crop-visual-review.json"), supplements: await json("../research/concepts/content-supplements.json") });
const conceptIds = new Set(taxonomy.concepts.map(c => c.id));
const FRQ = "frq-2003-3-536", MCQ = "mcq-2008-6-31"; // FRQ catalog parts are ranges: (a)–(b), (c), (d onward)
const questionParts = new Map([FRQ, MCQ].map(id => [id, questionContent(id, ctx).parts]));
const review = over => ({
  format: AI_REVIEW_FORMAT, reviewer: { model: "GPT-6" },
  questions: [
    { questionId: MCQ, contentStatus: "complete", independent: { parts: { stem: { primary: ["titration-curves"], supporting: ["pka-speciation"] } } } },
    { questionId: FRQ, contentStatus: "complete", independent: { parts: { a: { primary: ["equilibrium-expression"], supporting: [] }, "c-i": { primary: ["buffers"], supporting: ["net-ionic-equations"] }, e: { primary: ["pka-speciation"], supporting: [] } } } },
  ],
  conventions: [{ id: "C1-shape-vs-polarity", recommendation: "C", rationale: "x" }],
  ...over,
});
const check = r => validateAiReview(r, { conceptIds, questionParts, conventions });

test("AI review validation accepts printed subparts of range parts and rejects bad input", () => {
  assert.deepEqual(check(review()).errors, []);
  const bad = review({ format: "x", reviewer: {}, conventions: [{ id: "C1-shape-vs-polarity", recommendation: "Z" }, { id: "nope", recommendation: "A" }] });
  bad.questions[0].independent.parts.stem.primary = ["not-a-concept"];
  bad.questions[1].independent.parts.zz = { primary: ["buffers"], supporting: ["buffers"] };
  bad.questions.push({ questionId: "mcq-unknown", contentStatus: "complete" }, { questionId: MCQ, contentStatus: "maybe" });
  const { errors } = check(bad);
  for (const pattern of [/format/, /reviewer\.model/, /unknown concept not-a-concept/, /unknown part zz/, /more than one role/, /not in the package/, /listed twice/, /contentStatus/, /recommendation must be/, /unknown convention nope/]) assert.ok(errors.some(e => pattern.test(e)), `expected error ${pattern}`);
  assert.ok(check({ ...review(), questions: [review().questions[0]] }).warnings.some(w => w.includes(`${FRQ}: not reviewed`)));
});

test("an imported AI review is a labelled, non-human reference usable for scoring", () => {
  const ref = aiReviewToReference(review({ questions: [...review().questions, { questionId: "x", contentStatus: "ambiguous", contentIssues: ["two readings"] }] }), { importedAt: "t", sourceSha256: "abc" });
  assert.equal(ref.humanVerified, false);
  assert.match(ref.referenceKind, /independent AI review \(GPT-6\); NOT human-verified/);
  assert.equal(ref.questions.x.contentStatus, "partial", "ambiguous questions are not scored");
  const record = { contentStatus: "complete", parts: [{ partId: "stem", primary: [{ conceptId: "titration-curves" }], supporting: [], contextual: [] }] };
  const s = scoreAgainstReference({ [MCQ]: record }, { questions: { [MCQ]: ref.questions[MCQ] } }).summary;
  assert.equal(s.primary.precision, 1);
  assert.equal(s.supporting.recall, 0);
});

test("review package: completeness flags and question pages carry no classifier tags", () => {
  const content = questionContent("mcq-2024-21-2091", ctx);
  const c = completenessFlags({ content, record: { contentStatus: "complete", cropIssue: "wrong-question" }, catalogIssues: [{ questionId: "mcq-2024-21-2091", kind: "wrong-page", detail: "page 2089" }] });
  assert.equal(c.status, "complete-with-cautions");
  for (const kind of ["supplement:replace", "ocr-text-withheld", "crop:wrong-question", "catalog:wrong-page"]) assert.ok(c.flags.some(f => f.kind === kind), kind);
  assert.equal(completenessFlags({ content, record: { contentStatus: "partial" } }).status, "incomplete");
  const md = questionMarkdown({ questionId: FRQ, set: "benchmark", type: "FRQ", exam: "e", number: 3, catalogTopics: { primary: "7.4" }, completeness: c, images: [{ kind: "crop", file: "images/crops/a.png", pdf: "p.pdf", page: 1, rect: [0, 0, 1, 1] }], parts: questionParts.get(FRQ), ocrText: "text" });
  assert.match(md, /not authoritative/);
  assert.match(md, /`d-onward`/);
  assert.doesNotMatch(md, /primary|supporting|evidence/i);
  const concepts = conceptsMarkdown(taxonomy);
  assert.equal((concepts.match(/^### `/gm) ?? []).length, taxonomy.concepts.length);
  assert.match(concepts, /Do not tag when/);
});
