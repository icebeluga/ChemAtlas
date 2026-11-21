// Concept search index built only from stored associations; counts are never hardcoded.
// By default only human-verified records are indexed; provisional machine output must be requested explicitly.
export const VERIFIED = ["human_verified"];
export const PROVISIONAL = ["human_verified", "machine_reviewed", "machine_generated"];

export function buildConceptIndex({ store, taxonomy, catalog, include = VERIFIED, isStale = () => false }) {
  const topicUnit = new Map(catalog.units.flatMap(u => u.topics.map(([id]) => [id, u.id])));
  const byId = new Map(catalog.questions.map(q => [q.id, q]));
  const questions = {};
  for (const { current: r } of Object.values(store.records)) {
    if (!r || !include.includes(r.reviewStatus) || !r.aggregate || !byId.has(r.questionId) || isStale(r)) continue;
    const q = byId.get(r.questionId);
    const topics = [...new Set([r.officialTopics.primary, ...r.officialTopics.additional, ...(q.relatedTopics ?? [])].filter(Boolean))];
    questions[r.questionId] = {
      type: q.type, status: r.reviewStatus, topics, units: [...new Set(topics.map(t => topicUnit.get(t)).filter(Boolean))],
      primary: r.aggregate.primary, supporting: r.aggregate.supporting,
      parts: r.parts.filter(p => p.partId !== "stem").map(p => ({ partId: p.partId, label: p.label, concepts: [...p.primary, ...p.supporting].map(a => a.conceptId) })),
    };
  }
  const concepts = {};
  for (const c of taxonomy.concepts) concepts[c.id] = { name: c.name, group: c.group, topics: c.topics, scope: c.scope, questionIds: [] };
  for (const [id, q] of Object.entries(questions)) for (const c of [...q.primary, ...q.supporting]) concepts[c]?.questionIds.push(id);
  for (const c of Object.values(concepts)) c.questionIds.sort();
  return { schemaVersion: 1, taxonomyVersion: taxonomy.taxonomyVersion, taxonomyHash: taxonomy.taxonomyHash, includedStatuses: include, questionCount: Object.keys(questions).length, concepts, questions };
}

// mode "all" = question must test every selected concept (AND); "any" = at least one (OR). Contextual tags never match.
export function searchQuestions(index, { concepts = [], mode = "any", unit, topic, type, role = "any" } = {}) {
  const has = (q, c) => (role === "primary" ? q.primary.includes(c) : q.primary.includes(c) || q.supporting.includes(c));
  return Object.entries(index.questions)
    .filter(([, q]) => (!type || type === "Mixed" || q.type === type) && (!unit || unit === "all" || q.units.includes(unit)) && (!topic || topic === "all" || q.topics.includes(topic)))
    .filter(([, q]) => !concepts.length || (mode === "all" ? concepts.every(c => has(q, c)) : concepts.some(c => has(q, c))))
    .map(([id]) => id).sort();
}

// Concepts relevant to a topic for unit -> topic -> concept browsing, with live counts.
export function conceptsForTopic(index, topicId) {
  return Object.entries(index.concepts)
    .filter(([, c]) => c.topics.primary.includes(topicId) || c.topics.related.includes(topicId) || c.questionIds.some(id => index.questions[id].topics.includes(topicId)))
    .map(([id, c]) => ({ id, name: c.name, count: c.questionIds.filter(q => index.questions[q].topics.includes(topicId)).length, crossTopicCount: c.questionIds.length }));
}
