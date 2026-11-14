// Question content retrieval: everything a classifier may look at, plus a readiness verdict and a content hash.
import { sha256 } from "./taxonomy.mjs";

export const partIdFromLabel = label => label.toLowerCase().replace(/[()]/g, " ").trim().split(/\s+/).join("-");

export function createContentContext({ catalog, stimuli, cropReview }) {
  return {
    catalog,
    byId: new Map(catalog.questions.map(q => [q.id, q])),
    stimuli: stimuli.stimuli,
    cropReviews: new Map((cropReview?.reviews ?? []).map(r => [r.questionId, r])),
  };
}

export function sourcePageRef(catalog, page) {
  const file = catalog.sourceFiles.find(f => f.from <= page && page <= f.to);
  return file ? { pdf: `public${file.url}`, localPage: page - file.from + 1, compiledPage: page } : null;
}

const DIAGRAM_CUE = /\b(shown|diagram|graph|figure|picture|represent|drawing|structure[s]? (?:below|above)|table|spectrum|plot|curve|apparatus|data below|above)\b/i;
const OCR_NOISE = /[□�]|[^\x00-\x7F]{4,}/;

// Readiness never claims a question is complete; it says whether text alone could be enough to classify it.
export function assessReadiness(q, { stimulusMissing, cropVerified }) {
  const reasons = [], text = q.fullText ?? "";
  const regions = q.sourceRegions ?? [];
  if (!text.trim() && !regions.length && !q.pages?.length) return { status: "blocked", reasons: ["no-text-and-no-source-region"] };
  for (const w of q.extractionWarnings ?? []) {
    if (/answer\/scoring\/diagnostic/i.test(w)) reasons.push("source-is-answer-or-scoring-page");
    else if (/not legible|not located/i.test(w)) reasons.push("question-number-not-confirmed");
    else if (/scanned page image is authoritative/i.test(w)) reasons.push("scanned-no-text-layer");
    else if (/diagrams|graph/i.test(w)) reasons.push("diagram-content");
    else reasons.push("crop-not-manually-verified");
  }
  if (text.trim().length < 80) reasons.push("text-too-short");
  if (OCR_NOISE.test(text)) reasons.push("possible-ocr-loss");
  if (DIAGRAM_CUE.test(text)) reasons.push("refers-to-visual-content");
  if (q.type === "MCQ" && !/\(D\)|\bD\)|\bD\./.test(text) && !(q.stimulusIds ?? []).length) reasons.push("choices-not-in-text");
  if (q.type === "MCQ" && new RegExp(`(^|\\n)\\s*${Number(q.number) + 1}\\s*\\.\\s+\\S`).test(text)) reasons.push("adjacent-question-text");
  if (stimulusMissing) reasons.push("stimulus-not-registered");
  if (!cropVerified) reasons.push("crop-unverified");
  const unique = [...new Set(reasons)];
  const textOnlyOk = unique.every(r => r === "crop-unverified");
  return { status: textOnlyOk ? "text-sufficient-candidate" : "needs-visual-check", reasons: unique };
}

export function questionContent(id, ctx) {
  const q = ctx.byId.get(id);
  if (!q) throw new Error(`unknown question ${id}`);
  const stimulus = (q.stimulusIds ?? []).map(sid => ({ id: sid, ...(ctx.stimuli[sid] ?? { missing: true }) }));
  const crop = ctx.cropReviews.get(id);
  const parts = q.type === "FRQ" && q.topicParts.length ? q.topicParts.map(p => ({ partId: partIdFromLabel(p.label), label: p.label, catalogTopics: p.topics })) : [{ partId: "stem", label: q.type === "FRQ" ? "(whole question)" : "(stem)", catalogTopics: q.relatedTopics }];
  const regions = (q.sourceRegions?.length ? q.sourceRegions : (q.sourcePagesOriginal ?? q.pages).map(page => ({ page, rect: null }))).map(r => ({ ...r, source: sourcePageRef(ctx.catalog, r.page) }));
  const content = {
    questionId: id, type: q.type, exam: q.exam, year: q.year, number: q.number,
    text: q.fullText ?? "", regions, stimulus, parts,
    catalogTopics: { primary: q.primaryTopic, secondary: q.secondaryTopics, status: q.status, method: q.classificationMethod },
    crop: { verified: crop?.status === "visually_verified", status: crop?.status ?? "not-reviewed", note: crop?.verification ?? null },
    warnings: q.extractionWarnings ?? [],
    legacyConcepts: q.legacyConcepts ?? [],
  };
  content.readiness = assessReadiness(q, { stimulusMissing: stimulus.some(s => s.missing), cropVerified: content.crop.verified });
  content.contentHash = contentHash(q, stimulus);
  return content;
}

export function contentHash(q, stimulus = []) {
  return sha256(JSON.stringify([q.fullText ?? "", q.sourceRegions ?? [], q.sourcePagesOriginal ?? q.pages, q.type, (q.topicParts ?? []).map(p => p.label), stimulus.map(s => [s.id, s.regions ?? null])])).slice(0, 16);
}
