import { coverageOf, partCovered } from "./content.mjs";
// Agreement between two classifications and precision/recall against a reference set.
const ids = list => new Set(list.map(a => (typeof a === "string" ? a : a.conceptId)));
const jaccard = (a, b) => (a.size + b.size === 0 ? 1 : [...a].filter(x => b.has(x)).length / new Set([...a, ...b]).size);
const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// Concepts of the parts in `record` that correspond to reference/other part `key` (exact id, a refinement, or a coarser parent).
function conceptsFor(parts, key) {
  // A coarse range part ("a–c", "all-parts") on either side also matches the printed parts it covers.
  const covers = (range, id) => range !== id && coverageOf(range).kind !== "exact" && partCovered(id, coverageOf(range));
  const match = parts.filter(p => p.partId === key || p.partId.startsWith(`${key}-`) || key.startsWith(`${p.partId}-`) || covers(p.partId, key) || covers(key, p.partId));
  return { primary: ids(match.flatMap(p => p.primary)), supporting: ids(match.flatMap(p => p.supporting)), found: match.length > 0 };
}

export function compareClassifications(a, b) {
  if (a.contentStatus !== b.contentStatus) return { agreement: "disagree", summary: `content status ${a.contentStatus} vs ${b.contentStatus}`, parts: [] };
  const keys = [...new Set(a.parts.map(p => p.partId))];
  const parts = keys.map(k => {
    const x = conceptsFor(a.parts, k), y = conceptsFor(b.parts, k);
    const primaryOverlap = [...x.primary].some(c => y.primary.has(c));
    return { partId: k, primaryEqual: same(x.primary, y.primary), primaryOverlap, supportingJaccard: Number(jaccard(x.supporting, y.supporting).toFixed(2)), a: { primary: [...x.primary], supporting: [...x.supporting] }, b: { primary: [...y.primary], supporting: [...y.supporting] } };
  });
  const agreement = parts.every(p => p.primaryEqual && p.supportingJaccard >= 0.5) ? "agree" : parts.every(p => p.primaryOverlap) ? "partial" : "disagree";
  const summary = parts.filter(p => !p.primaryEqual || p.supportingJaccard < 0.5).map(p => `${p.partId}: primary ${p.a.primary.join("+") || "-"} vs ${p.b.primary.join("+") || "-"}; supporting ${p.a.supporting.join("+") || "-"} vs ${p.b.supporting.join("+") || "-"}`).join(" | ");
  return { agreement, summary, parts };
}

// reference: { questions: { [id]: { contentStatus, parts: { [partId]: { primary: [], supporting: [] } } } } }
export function scoreAgainstReference(records, reference) {
  const tally = () => ({ tp: 0, fp: 0, fn: 0 });
  const t = { primary: tally(), supporting: tally(), anyRole: tally() };
  const errors = [];
  let compared = 0, missing = 0, statusMismatch = 0;
  for (const [qid, ref] of Object.entries(reference.questions)) {
    const rec = records[qid];
    if (!rec) { missing++; continue; }
    if (ref.contentStatus !== "complete" || rec.contentStatus !== "complete") { if (ref.contentStatus !== rec.contentStatus) { statusMismatch++; errors.push({ questionId: qid, issue: `content status ${rec.contentStatus} vs reference ${ref.contentStatus}` }); } continue; }
    compared++;
    for (const [key, r] of Object.entries(ref.parts)) {
      const got = conceptsFor(rec.parts, key);
      const rp = new Set(r.primary), rs = new Set(r.supporting), rAll = new Set([...rp, ...rs]), gAll = new Set([...got.primary, ...got.supporting]);
      const add = (bucket, gotSet, refSet, label) => {
        for (const c of gotSet) if (refSet.has(c)) bucket.tp++; else { bucket.fp++; errors.push({ questionId: qid, partId: key, issue: `extra ${label} ${c}` }); }
        for (const c of refSet) if (!gotSet.has(c)) { bucket.fn++; errors.push({ questionId: qid, partId: key, issue: `missed ${label} ${c}` }); }
      };
      add(t.primary, got.primary, rp, "primary");
      add(t.supporting, got.supporting, rs, "supporting");
      for (const c of gAll) rAll.has(c) ? t.anyRole.tp++ : t.anyRole.fp++;
      for (const c of rAll) if (!gAll.has(c)) t.anyRole.fn++;
    }
  }
  const pr = b => ({ precision: b.tp + b.fp ? Number((b.tp / (b.tp + b.fp)).toFixed(3)) : null, recall: b.tp + b.fn ? Number((b.tp / (b.tp + b.fn)).toFixed(3)) : null, ...b });
  return { summary: { referenceQuestions: Object.keys(reference.questions).length, compared, missing, statusMismatch, primary: pr(t.primary), supporting: pr(t.supporting), anyRole: pr(t.anyRole), referenceKind: reference.referenceKind ?? "unspecified" }, errors };
}
