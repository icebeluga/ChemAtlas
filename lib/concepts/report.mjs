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
