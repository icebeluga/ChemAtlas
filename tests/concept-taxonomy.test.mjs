import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildTaxonomy, createResolver, sha256, catalogTopics } from "../lib/concepts/taxonomy.mjs";
import { buildConceptGraph } from "../lib/concepts/graph.mjs";

const read = path => readFile(new URL(path, import.meta.url));
const json = async path => JSON.parse(await read(path));
const research = await json("../research/concept-taxonomy/ChemAtlas_AP_Chemistry_Concept_Taxonomy.json");
const source = await json("../research/concepts/concepts.v1.source.json");
const catalog = await json("../public/student-questions.json");
const committed = await json("../research/concepts/taxonomy.v1.json");

test("research inputs are the unchanged originals", async () => {
  // Hash of the bytes as committed with LF endings; normalize so a CRLF checkout still compares equal.
  const lf = async p => sha256((await read(p)).toString("utf8").replace(/\r\n/g, "\n"));
  assert.equal(await lf("../research/concept-taxonomy/ChemAtlas_AP_Chemistry_Concept_Taxonomy.json"), "0261a26b815c1777732e4c4b96af0c21a335d9535344c86857b58e46309bd378");
  assert.equal(await lf("../research/concept-taxonomy/ChemAtlas_AP_Chemistry_Concept_Research.md"), "57f8425e7b94d79ed1d9071e4859884f59da1492d31be62e75af886371ff0a1d");
  assert.deepEqual(research.counts, { units: 9, topics: 91, topic_micro_concept_links: 814, distinct_micro_concept_labels: 810, cross_topic_concept_groups: 57 });
});

test("the committed taxonomy is exactly what the builder produces", () => {
  const { taxonomy, errors, warnings } = buildTaxonomy({ source, research, catalog, researchHashes: committed.provenance.researchFiles });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, ['warning: research topic 8.4 name "Acid-Base Reactions" differs from catalog "Acid-Base Reactions and Buffers" (catalog name kept)']);
  assert.deepEqual(taxonomy, committed, "run `node scripts/concepts/cli.mjs build-taxonomy` after editing the source");
});

test("taxonomy integrity: unique ids, valid links, full topic coverage, every research label mapped", () => {
  const ids = committed.concepts.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const conceptIds = new Set(ids), skillIds = new Set(committed.skills.map(s => s.id));
  const topics = catalogTopics(catalog);
  for (const t of topics.keys()) assert.ok(committed.concepts.some(c => c.topics.primary.includes(t)), `topic ${t} lacks a primary concept`);
  for (const c of committed.concepts) {
    for (const r of [...c.related, ...c.prerequisites]) assert.ok(conceptIds.has(r), `${c.id} -> ${r}`);
    assert.ok(c.definition && c.include && c.exclude && c.examples.positive && c.examples.negative, c.id);
    assert.match(c.hash, /^[0-9a-f]{16}$/);
  }
  assert.equal(Object.keys(committed.microConceptMap).length, 810);
  for (const [id, m] of Object.entries(committed.microConceptMap)) assert.ok(m.kind === "skill" ? skillIds.has(m.target) : conceptIds.has(m.target), `${id} -> ${m.target}`);
  assert.equal(committed.researchCrosswalk.length, 57);
  assert.ok(committed.researchCrosswalk.every(r => r.concepts.length && r.concepts.every(c => conceptIds.has(c))));
});

test("aliases and wording variants resolve to one canonical concept", () => {
  const { resolve } = createResolver(committed);
  for (const term of ["formal charge", "Formal charges", "FC", "formal-charge-calculation", "formal charge calculation"]) assert.equal(resolve(term), "formal-charge", term);
  assert.equal(resolve("VSEPR"), "molecular-geometry");
  assert.equal(resolve("Le Châtelier"), "le-chatelier");
  assert.equal(resolve("le chatelier"), "le-chatelier");
  assert.equal(resolve("Ksp"), "solubility-product");
  assert.equal(resolve("sp3"), "hybridization");
  assert.equal(resolve("not a chemistry concept"), null);
});

test("concept graph links resolve and expose the educational relationships", () => {
  const graph = buildConceptGraph({ taxonomy: committed, catalog, store: null });
  const nodes = new Set(graph.nodes.map(n => n.id));
  assert.equal(nodes.size, graph.nodes.length);
  for (const l of graph.links) assert.ok(nodes.has(l.source) && nodes.has(l.target), `${l.source} -> ${l.target}`);
  const has = (s, t, r) => graph.links.some(l => l.source === s && l.target === t && l.relation === r);
  assert.ok(has("concept:formal-charge", "topic:2.6", "RELEVANT_TO"));
  assert.ok(has("concept:formal-charge", "concept:lewis-structures", "REQUIRES_PRIOR"));
  assert.ok(graph.links.some(l => l.relation === "RELATED_TO" && [l.source, l.target].includes("concept:formal-charge") && [l.source, l.target].includes("concept:resonance")));
  assert.ok(has("topic:2.7", "unit:u2", "PART_OF"));
});
