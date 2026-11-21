// Canonical concept taxonomy: build from the authored source + research inputs, validate, resolve aliases.
import { createHash } from "node:crypto";

export const sha256 = text => createHash("sha256").update(text).digest("hex");
const norm = text => String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const singular = text => text.split(" ").map(w => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)).join(" ");

// Only the fields that change a concept's meaning; editing examples or aliases does not invalidate classifications.
export const conceptHash = c => sha256(JSON.stringify([c.id, c.definition, c.include, c.exclude, c.topics])).slice(0, 16);

export function catalogTopics(catalog) {
  return new Map(catalog.units.flatMap(u => u.topics.map(([id, name]) => [id, { id, name, unit: u.id }])));
}

export function validateResearch(research, topics) {
  const errors = [];
  const links = research.units.flatMap(u => u.topics.flatMap(t => t.concepts.map(c => ({ ...c, topic: t.id }))));
  const expect = { units: research.units.length, topics: research.units.reduce((n, u) => n + u.topics.length, 0), topic_micro_concept_links: links.length, distinct_micro_concept_labels: research.micro_concept_index.length, cross_topic_concept_groups: research.cross_topic_concept_groups.length };
  for (const [key, value] of Object.entries(expect)) if (research.counts[key] !== value) errors.push(`research counts.${key}=${research.counts[key]} but found ${value}`);
  for (const unit of research.units) for (const t of unit.topics) {
    if (!topics.has(t.id)) errors.push(`research topic ${t.id} not in catalog`);
    else if (norm(topics.get(t.id).name) !== norm(t.name)) errors.push(`warning: research topic ${t.id} name "${t.name}" differs from catalog "${topics.get(t.id).name}" (catalog name kept)`);
  }
  if (topics.size !== expect.topics) errors.push(`catalog has ${topics.size} topics, research has ${expect.topics}`);
  const indexIds = new Set(research.micro_concept_index.map(m => m.id));
  for (const l of links) if (!indexIds.has(l.id)) errors.push(`micro ${l.id} missing from micro_concept_index`);
  for (const g of research.cross_topic_concept_groups) for (const t of [...g.primary_topic_ids, ...g.related_topic_ids]) if (!topics.has(t)) errors.push(`group ${g.id} references unknown topic ${t}`);
  return errors;
}

export function buildTaxonomy({ source, research, catalog, researchHashes = {} }) {
  const topics = catalogTopics(catalog);
  const errors = validateResearch(research, topics);
  const ids = new Set(), groups = new Set(source.groups.map(g => g.id));
  for (const c of [...source.concepts, ...source.skills]) {
    if (ids.has(c.id)) errors.push(`duplicate id ${c.id}`);
    ids.add(c.id);
  }
  const conceptIds = new Set(source.concepts.map(c => c.id));
  const researchGroupIds = new Set(research.cross_topic_concept_groups.map(g => g.id));
  for (const c of source.concepts) {
    for (const f of ["name", "group", "definition", "include", "exclude"]) if (!c[f]) errors.push(`${c.id} missing ${f}`);
    if (!groups.has(c.group)) errors.push(`${c.id} unknown group ${c.group}`);
    if (!c.examples?.positive || !c.examples?.negative) errors.push(`${c.id} missing examples`);
    if (c.scope !== "beyond-ap" && !c.topics.primary.length) errors.push(`${c.id} has no primary topic`);
    for (const t of [...c.topics.primary, ...c.topics.related]) if (!topics.has(t)) errors.push(`${c.id} unknown topic ${t}`);
    for (const r of [...c.related, ...c.prerequisites]) if (!conceptIds.has(r)) errors.push(`${c.id} references unknown concept ${r}`);
    if (c.prerequisites.includes(c.id) || c.related.includes(c.id)) errors.push(`${c.id} references itself`);
    for (const g of c.researchGroups) if (!researchGroupIds.has(g)) errors.push(`${c.id} unknown research group ${g}`);
    for (const p of c.microPatterns) try { new RegExp(p, "i"); } catch { errors.push(`${c.id} bad pattern ${p}`); }
  }
  for (const t of topics.keys()) if (!source.concepts.some(c => c.topics.primary.includes(t))) errors.push(`topic ${t} has no primary concept`);
  // Prerequisite cycles would make "requires" traversal loop forever.
  const prereq = new Map(source.concepts.map(c => [c.id, c.prerequisites]));
  const visiting = new Set(), done = new Set();
  const visit = id => { if (done.has(id)) return; if (visiting.has(id)) { errors.push(`prerequisite cycle at ${id}`); return; } visiting.add(id); for (const p of prereq.get(id) ?? []) visit(p); visiting.delete(id); done.add(id); };
  for (const id of prereq.keys()) visit(id);

  const microMap = mapMicroConcepts(research, source);
  const crosswalk = research.cross_topic_concept_groups.map(g => {
    const targets = source.concepts.filter(c => c.researchGroups.includes(g.id)).map(c => c.id);
    return { researchGroupId: g.id, name: g.name, concepts: targets, disposition: targets.length === 1 && targets[0] === g.id ? "kept" : targets.includes(g.id) ? "kept-and-split" : targets.length > 1 ? "split" : targets.length === 1 ? "renamed-or-merged" : "unmapped" };
  });
  for (const row of crosswalk) if (row.disposition === "unmapped") errors.push(`research group ${row.researchGroupId} has no canonical concept`);

  const concepts = source.concepts.map(({ microPatterns, ...c }) => ({
    ...c, scope: c.scope ?? "ap",
    units: [...new Set([...c.topics.primary, ...c.topics.related].map(t => topics.get(t).unit))],
    researchMicroConcepts: Object.entries(microMap).filter(([, m]) => m.target === c.id).map(([id]) => id),
    hash: conceptHash(c),
  }));
  const body = { taxonomyVersion: source.taxonomyVersion, status: source.status, notice: source.notice, groups: source.groups, concepts, skills: source.skills.map(({ patterns, ...s }) => s), researchCrosswalk: crosswalk, microConceptMap: microMap, provenance: { researchSchemaVersion: research.schema_version, researchFiles: researchHashes, researchCounts: research.counts } };
  const warnings = errors.filter(e => e.startsWith("warning:"));
  body.provenance.researchWarnings = warnings;
  return { taxonomy: { ...body, taxonomyHash: sha256(JSON.stringify(concepts.map(c => [c.id, c.hash]))).slice(0, 16) }, errors: errors.filter(e => !warnings.includes(e)), warnings };
}

// Every research micro-concept label maps to exactly one canonical concept or skill, with the method recorded for review.
export function mapMicroConcepts(research, source) {
  const result = {};
  const test = (patterns, label) => patterns.some(p => new RegExp(p, "i").test(label));
  for (const m of research.micro_concept_index) {
    const skill = source.skills.find(s => test(s.patterns, m.label));
    const primary = source.concepts.filter(c => m.topic_ids.some(t => c.topics.primary.includes(t)));
    const related = source.concepts.filter(c => m.topic_ids.some(t => c.topics.related.includes(t)));
    let target, method;
    const hit = primary.find(c => test(c.microPatterns, m.label)) ?? related.find(c => test(c.microPatterns, m.label));
    if (hit) [target, method] = [hit.id, "pattern"];
    else if (skill) [target, method] = [skill.id, "skill"];
    else { const any = source.concepts.find(c => test(c.microPatterns, m.label)); if (any) [target, method] = [any.id, "pattern-cross-topic"]; else [target, method] = [primary[0]?.id, "topic-default"]; }
    result[m.id] = { label: m.label, topics: m.topic_ids, target, kind: method === "skill" ? "skill" : "concept", method };
  }
  return result;
}

export function createResolver(taxonomy) {
  const byKey = new Map();
  const add = (key, id) => { const k = singular(norm(key)); if (k && !byKey.has(k)) byKey.set(k, id); };
  for (const c of taxonomy.concepts) { add(c.id.replace(/-/g, " "), c.id); add(c.name, c.id); }
  for (const c of taxonomy.concepts) for (const a of c.aliases) add(a, c.id);
  for (const [id, m] of Object.entries(taxonomy.microConceptMap)) if (m.kind === "concept") { add(id.replace(/-/g, " "), m.target); add(m.label, m.target); }
  const concepts = new Map(taxonomy.concepts.map(c => [c.id, c]));
  return { concepts, resolve: term => (concepts.has(term) ? term : byKey.get(singular(norm(term))) ?? null) };
}
