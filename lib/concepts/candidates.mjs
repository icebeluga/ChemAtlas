// Candidate narrowing: a short, explained list of concepts to show the classifier, so the whole taxonomy is not sent per question.
// The classifier may still choose any taxonomy concept; candidates only order the reading list.
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function candidateConcepts(content, taxonomy, { limit = 24 } = {}) {
  const scores = new Map();
  const bump = (id, n, why) => { const s = scores.get(id) ?? { conceptId: id, score: 0, reasons: [] }; s.score += n; if (!s.reasons.includes(why)) s.reasons.push(why); scores.set(id, s); };
  const topics = new Set([content.catalogTopics.primary, ...(content.catalogTopics.secondary ?? []), ...content.parts.flatMap(p => p.catalogTopics ?? [])].filter(Boolean));
  const byId = new Map(taxonomy.concepts.map(c => [c.id, c]));
  for (const c of taxonomy.concepts) {
    if (c.topics.primary.some(t => topics.has(t))) bump(c.id, 3, "catalog-topic-primary");
    else if (c.topics.related.some(t => topics.has(t))) bump(c.id, 1, "catalog-topic-related");
  }
  // Lexical hints are only hints: a term in the passage does not mean the concept is assessed.
  const text = content.text;
  for (const c of taxonomy.concepts) {
    const terms = [c.name, ...c.aliases].filter(t => t.length >= 4);
    if (terms.some(t => new RegExp(`(^|[^A-Za-z])${escape(t)}([^A-Za-z]|$)`, "i").test(text))) bump(c.id, 2, "term-in-text");
  }
  for (const legacy of content.legacyConcepts) for (const c of taxonomy.concepts) if (c.scope === "beyond-ap" && [c.name, ...c.aliases].some(a => legacy.toLowerCase().includes(a.toLowerCase().split(" ")[0]))) bump(c.id, 2, "legacy-concept-note");
  const top = [...scores.values()].filter(s => s.score >= 3).map(s => s.conceptId);
  for (const id of top) for (const r of [...byId.get(id).related, ...byId.get(id).prerequisites]) bump(r, 0.5, `linked-from:${id}`);
  return [...scores.values()].sort((a, b) => b.score - a.score || a.conceptId.localeCompare(b.conceptId)).slice(0, limit);
}
