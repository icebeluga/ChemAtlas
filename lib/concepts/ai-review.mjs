// Import of an independent AI review (e.g. GPT-6) of the review package. The result is stored as its own reference file,
// labelled "independent AI review". It is never written into classifications.json, never marks anything human_verified,
// and never decides a convention.
import { STANDARD_PART, coverageOf, partCovered } from "./content.mjs";

export const AI_REVIEW_FORMAT = "chematlas-ai-review/v1";
const STATUSES = ["complete", "partial", "unreadable", "ambiguous"];
const ISSUES = ["missing", "incorrect", "unnecessary", "wrong-role"];
const VERDICTS = ["agree", "minor-differences", "over-tagged", "under-tagged", "wrong-primary", "wrong-role", "wrong-content-status"];

// questionParts: Map questionId -> [{ partId }] from the package manifest.
export function validateAiReview(review, { conceptIds, questionParts, conventions = [] }) {
  const errors = [], warnings = [];
  if (review?.format !== AI_REVIEW_FORMAT) errors.push(`format must be "${AI_REVIEW_FORMAT}"`);
  if (!review?.reviewer?.model) errors.push("reviewer.model is required");
  const seen = new Set();
  for (const q of review?.questions ?? []) {
    const where = q.questionId ?? "(no questionId)";
    if (!questionParts.has(q.questionId)) { errors.push(`${where}: not in the package`); continue; }
    if (seen.has(q.questionId)) errors.push(`${where}: listed twice`);
    seen.add(q.questionId);
    if (!STATUSES.includes(q.contentStatus)) errors.push(`${where}: contentStatus must be one of ${STATUSES.join(", ")}`);
    const parts = q.independent?.parts ?? {};
    if (q.contentStatus === "complete") {
      if (!Object.keys(parts).length) errors.push(`${where}: complete questions need independent.parts`);
      const catalog = questionParts.get(q.questionId);
      for (const [pid, p] of Object.entries(parts)) {
        const known = catalog.some(c => c.partId === pid) || (pid !== "stem" && STANDARD_PART.test(pid) && catalog.some(c => c.partId === pid[0] || partCovered(pid, coverageOf(c.label ?? c.partId))));
        if (!known) errors.push(`${where}: unknown part ${pid}`);
        if (!p.primary?.length) errors.push(`${where} ${pid}: needs at least one primary concept`);
        if ((p.primary?.length ?? 0) > 2) warnings.push(`${where} ${pid}: more than two primary concepts`);
        for (const role of ["primary", "supporting", "contextual"]) for (const id of p[role] ?? []) if (!conceptIds.has(id)) errors.push(`${where} ${pid}: unknown concept ${id} (${role})`);
        const ids = ["primary", "supporting", "contextual"].flatMap(r => p[r] ?? []);
        const dup = ids.find((id, i) => ids.indexOf(id) !== i);
        if (dup) errors.push(`${where} ${pid}: ${dup} appears in more than one role`);
      }
    }
    const verdict = q.comparison?.verdict;
    if (verdict && !VERDICTS.includes(verdict)) errors.push(`${where}: comparison.verdict must be one of ${VERDICTS.join(", ")}`);
    for (const f of q.comparison?.findings ?? []) {
      if (!ISSUES.includes(f.issue)) errors.push(`${where}: finding issue must be one of ${ISSUES.join(", ")}`);
      if (f.conceptId && !conceptIds.has(f.conceptId)) errors.push(`${where}: finding names unknown concept ${f.conceptId}`);
    }
  }
  for (const id of questionParts.keys()) if (!seen.has(id)) warnings.push(`${id}: not reviewed`);
  for (const c of review?.conventions ?? []) {
    const known = conventions.find(k => k.id === c.id);
    if (!known) errors.push(`unknown convention ${c.id}`);
    else if (c.recommendation && !Object.hasOwn(known.options, c.recommendation) && c.recommendation !== "other") errors.push(`convention ${c.id}: recommendation must be one of ${Object.keys(known.options).join(", ")} or other`);
  }
  return { errors, warnings };
}

// Reference-format view (usable with `cli.mjs evaluate --reference`) plus everything else the reviewer reported.
export function aiReviewToReference(review, { importedAt, sourceSha256 }) {
  const questions = {};
  for (const q of review.questions) {
    questions[q.questionId] = {
      contentStatus: q.contentStatus === "complete" ? "complete" : q.contentStatus === "unreadable" ? "unreadable" : "partial",
      parts: Object.fromEntries(Object.entries(q.independent?.parts ?? {}).map(([pid, p]) => [pid, { primary: p.primary ?? [], supporting: p.supporting ?? [], contextual: p.contextual ?? [] }])),
      confidence: q.confidence ?? null, contentIssues: q.contentIssues ?? [], comparison: q.comparison ?? null, notes: q.notes ?? "",
    };
  }
  return {
    referenceKind: `independent AI review (${review.reviewer.model}); NOT human-verified`,
    reviewKind: "independent-ai-review", humanVerified: false,
    reviewer: review.reviewer, reviewedAt: review.reviewedAt ?? null, importedAt, sourceSha256,
    questions,
    conventions: review.conventions ?? [], taxonomyIssues: review.taxonomyIssues ?? [], correctionChecks: review.correctionChecks ?? [], catalogIssues: review.catalogIssues ?? [], packageIssues: review.packageIssues ?? [],
  };
}
