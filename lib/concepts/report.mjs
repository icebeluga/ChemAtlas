// Pilot statistics computed from stored records and run artifacts (no hand-entered numbers).
export function pilotStats({ records, comparisons = [], ingest, selection, taxonomy }) {
  const names = Object.fromEntries(taxonomy.concepts.map(c => [c.id, c.name]));
  const count = (rows, key) => rows.reduce((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});
  const sorted = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const complete = records.filter(r => r.contentStatus === "complete");
  const primaryFreq = {}, supportFreq = {}, combos = {};
  for (const r of complete) {
    for (const c of r.aggregate.primary) primaryFreq[c] = (primaryFreq[c] ?? 0) + 1;
    for (const c of r.aggregate.supporting) supportFreq[c] = (supportFreq[c] ?? 0) + 1;
    for (const p of r.parts) {
      const set = [...p.primary, ...p.supporting].map(a => a.conceptId).sort();
      for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { const k = `${set[i]} + ${set[j]}`; combos[k] = (combos[k] ?? 0) + 1; }
    }
  }
  const parts = complete.flatMap(r => r.parts);
  const reasons = Object.fromEntries((selection?.questions ?? []).map(q => [q.id, q.reason]));
  return {
    processed: records.length,
    byType: count(records, r => r.type),
    byReviewStatus: count(records, r => r.reviewStatus),
    blocked: records.filter(r => r.contentStatus !== "complete").map(r => ({ questionId: r.questionId, status: r.contentStatus, notes: r.contentNotes, selectedAs: reasons[r.questionId] })),
    invalid: ingest?.invalid ?? [],
    cropIssues: count(records, r => r.cropIssue),
    diagram: count(records, r => r.diagramStatus),
    flags: sorted(records.flatMap(r => r.flags).reduce((m, f) => ((m[f] = (m[f] ?? 0) + 1), m), {})),
    partsClassified: parts.length,
    primaryPerPart: count(parts, p => p.primary.length),
    supportingPerPart: count(parts, p => p.supporting.length),
    distinctConceptsUsed: new Set(parts.flatMap(p => [...p.primary, ...p.supporting].map(a => a.conceptId))).size,
    topPrimary: sorted(primaryFreq).slice(0, 15).map(([id, n]) => [names[id] ?? id, n]),
    topSupporting: sorted(supportFreq).slice(0, 10).map(([id, n]) => [names[id] ?? id, n]),
    topCombinations: sorted(combos).slice(0, 10),
    topicChangedFromCatalog: records.filter(r => r.flags.includes("topic-differs-from-catalog")).length,
    agreement: count(comparisons, c => c.agreement),
    disagreements: comparisons.filter(c => c.agreement !== "agree").map(c => ({ questionId: c.questionId, agreement: c.agreement, summary: c.summary })),
  };
}

// Crop/content problems found by classifiers, as a worklist for the image-review owner. Read-only; changes nothing.
// Uses the earliest record that reported a problem, so a later re-classification from a supplement does not hide the original crop defect.
const CROP_PRIORITY = { "wrong-question": 0, "missing-content": 1, "no-crop": 2, "extra-content": 3, "missing-content-recovered-from-page": 4 };
const CROP_ACTION = {
  "wrong-question": "Re-locate the question: the cited page shows a different question.",
  "missing-content": "Add the missing page or region (continuation page, shared stimulus, cut-off part).",
  "no-crop": "Draw a crop; only the full page exists.",
  "extra-content": "Tighten the crop; it includes neighbouring questions.",
  "missing-content-recovered-from-page": "Extend the crop; the classifier had to read the missing part from the full page.",
};
export function cropWorklist({ entries, supplements = {} }) {
  const rows = [];
  for (const { current, history = [] } of entries) {
    const seen = [...history.map(h => h.record).filter(Boolean), current].find(r => r.cropIssue && r.cropIssue !== "none") ?? (current.diagramStatus === "unreadable" || current.diagramStatus === "partially-readable" ? current : null);
    if (!seen) continue;
    const sup = supplements[current.questionId];
    rows.push({
      questionId: current.questionId, cropIssue: seen.cropIssue, diagramStatus: seen.diagramStatus, priority: CROP_PRIORITY[seen.cropIssue] ?? 5,
      action: CROP_ACTION[seen.cropIssue] ?? "Check diagram legibility.", classifierNote: seen.contentNotes,
      supplement: sup ? { mode: sup.mode, pages: sup.regions.map(r => r.page), catalogCorrection: sup.catalogCorrection ?? null } : null,
      nowClassifiable: current.contentStatus === "complete",
    });
  }
  return rows.sort((a, b) => a.priority - b.priority || a.questionId.localeCompare(b.questionId));
}
