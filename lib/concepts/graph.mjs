// Chemistry concept graph in the node-link format graphify reads, so `graphify explain/path --graph` can query it.
import { catalogTopics } from "./taxonomy.mjs";

export function buildConceptGraph({ taxonomy, catalog, store }) {
  const nodes = [], links = [];
  const node = (id, label, kind, extra = {}) => nodes.push({ id, label, kind, file_type: "concept-graph", source_file: kind === "question" || kind === "frq-part" ? "research/concepts/classifications.json" : "research/concepts/taxonomy.v1.json", norm_label: label.toLowerCase(), ...extra });
  const link = (source, target, relation, extra = {}) => links.push({ source, target, relation, confidence: "EXTRACTED", weight: 1, source_file: "research/concepts/taxonomy.v1.json", ...extra });
  for (const u of catalog.units) node(`unit:${u.id}`, `Unit ${u.id.slice(1)}: ${u.name}`, "unit");
  for (const t of catalogTopics(catalog).values()) { node(`topic:${t.id}`, `Topic ${t.id} ${t.name}`, "topic"); link(`topic:${t.id}`, `unit:${t.unit}`, "PART_OF"); }
  for (const g of taxonomy.groups) node(`group:${g.id}`, g.name, "concept-group");
  for (const s of taxonomy.skills) node(`skill:${s.id}`, s.name, "skill");
  for (const c of taxonomy.concepts) {
    node(`concept:${c.id}`, c.name, "concept", { definition: c.definition, scope: c.scope });
    link(`concept:${c.id}`, `group:${c.group}`, "IN_GROUP");
    for (const t of c.topics.primary) link(`concept:${c.id}`, `topic:${t}`, "RELEVANT_TO", { strength: "primary" });
    for (const t of c.topics.related) link(`concept:${c.id}`, `topic:${t}`, "RELEVANT_TO", { strength: "related" });
    for (const p of c.prerequisites) link(`concept:${c.id}`, `concept:${p}`, "REQUIRES_PRIOR");
    // graphify loads a simple graph, so one edge per concept pair: prerequisite beats related, and related is written once.
    const other = r => taxonomy.concepts.find(x => x.id === r);
    for (const r of c.related) {
      if (c.prerequisites.includes(r) || other(r)?.prerequisites.includes(c.id)) continue;
      if (c.id < r || !other(r)?.related.includes(c.id)) link(`concept:${c.id}`, `concept:${r}`, "RELATED_TO");
    }
  }
  for (const record of Object.values(store?.records ?? {})) {
    const cur = record.current;
    if (!cur || cur.contentStatus === "blocked") continue;
    const q = `question:${cur.questionId}`;
    node(q, cur.questionId, "question", { reviewStatus: cur.reviewStatus });
    for (const t of [cur.officialTopics.primary, ...cur.officialTopics.additional].filter(Boolean)) link(q, `topic:${t}`, "BELONGS_TO");
    for (const part of cur.parts) {
      const owner = part.partId === "stem" ? q : `part:${cur.questionId}#${part.partId}`;
      if (owner !== q) { node(owner, `${cur.questionId} ${part.label}`, "frq-part"); link(owner, q, "PART_OF"); }
      for (const a of part.primary) link(owner, `concept:${a.conceptId}`, "TESTS", { evidence: a.evidence, reviewStatus: cur.reviewStatus });
      for (const a of part.supporting) link(owner, `concept:${a.conceptId}`, "REQUIRES", { evidence: a.evidence, reviewStatus: cur.reviewStatus });
    }
  }
  return { directed: true, multigraph: false, graph: { name: "chematlas-concepts", taxonomyVersion: taxonomy.taxonomyVersion }, nodes, links, hyperedges: [] };
}
