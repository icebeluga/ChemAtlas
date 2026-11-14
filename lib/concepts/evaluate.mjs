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
// ignore: [{ questionId, partId, concepts: [] }] — open boundary decisions (research/concepts/conventions.json); those concepts are not counted on either side.
export function scoreAgainstReference(records, reference, { ignore = [] } = {}) {
  const tally = () => ({ tp: 0, fp: 0, fn: 0 });
  const t = { primary: tally(), supporting: tally(), anyRole: tally() };
  const errors = [];
  const skip = new Set(ignore.flatMap(i => i.concepts.map(c => `${i.questionId}|${i.partId}|${c}`)));
  let roleSwaps = 0, ignored = 0;
  let compared = 0, missing = 0, statusMismatch = 0;
  for (const [qid, ref] of Object.entries(reference.questions)) {
    const rec = records[qid];
    if (!rec) { missing++; continue; }
    if (ref.contentStatus !== "complete" || rec.contentStatus !== "complete") { if (ref.contentStatus !== rec.contentStatus) { statusMismatch++; errors.push({ questionId: qid, issue: `content status ${rec.contentStatus} vs reference ${ref.contentStatus}` }); } continue; }
    compared++;
    for (const [key, r] of Object.entries(ref.parts)) {
      const got = conceptsFor(rec.parts, key);
      const keep = c => !skip.has(`${qid}|${key}|${c}`) || (ignored++, false);
      const rp = new Set(r.primary.filter(keep)), rs = new Set(r.supporting.filter(keep));
      got.primary = new Set([...got.primary].filter(keep)); got.supporting = new Set([...got.supporting].filter(keep));
      const rAll = new Set([...rp, ...rs]), gAll = new Set([...got.primary, ...got.supporting]);
      // A role swap: the concept is present on both sides but primary on one and supporting on the other.
      for (const c of got.supporting) if (rp.has(c) && !rs.has(c)) roleSwaps++;
      for (const c of got.primary) if (rs.has(c) && !rp.has(c)) roleSwaps++;
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
  return { summary: { referenceQuestions: Object.keys(reference.questions).length, compared, missing, statusMismatch, primary: pr(t.primary), supporting: pr(t.supporting), anyRole: pr(t.anyRole), roleSwaps, ignoredConceptMentions: ignored, referenceKind: reference.referenceKind ?? "unspecified" }, errors };
}

// A reference built only from records a named human approved or edited. Machine-agreed records never count.
export function humanReference(store, ids) {
  const questions = {}, reviewers = new Set();
  for (const id of ids) {
    const e = store.records[id];
    if (e?.current?.reviewStatus !== "human_verified") continue;
    const r = e.current;
    const reviewer = r.method?.engine === "human-edit" ? r.method.reviewer : [...e.history].reverse().find(h => h.event === "review" && h.to === "human_verified")?.reviewer;
    if (!reviewer) continue;
    reviewers.add(reviewer);
    questions[id] = { contentStatus: r.contentStatus, reviewer, parts: Object.fromEntries(r.parts.map(p => [p.partId, { primary: p.primary.map(a => a.conceptId), supporting: p.supporting.map(a => a.conceptId) }])) };
  }
  return { referenceKind: `human-reviewed (${[...reviewers].join(", ") || "none"})`, questions };
}
