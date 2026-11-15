import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const output = await build({
  stdin: { contents: 'export { deriveCatalogQuestions } from "./components/student/hooks/use-catalog";', resolveDir: fileURLToPath(new URL("..", import.meta.url)) },
  bundle: true, format: "esm", platform: "node", write: false,
  define: { "process.env.NODE_ENV": '"production"' },
});
const { deriveCatalogQuestions } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const catalog = JSON.parse(readFileSync(new URL("../public/student-questions.json", import.meta.url), "utf8"));
const topics = catalog.units.flatMap(unit => unit.topics.map(([id, name]) => ({ id, name, unit: unit.id, unitName: unit.name })));

test("catalog derivation preserves the real classified, multi-topic, and multi-unit totals", () => {
  const unitByTopic = new Map(topics.map(topic => [topic.id, topic.unit]));
  const classified = deriveCatalogQuestions(catalog.questions, {}, topics).filter(q => q.status === "classified");
  assert.equal(classified.length, 735);
  assert.equal(classified.filter(q => q.relatedTopics.length > 1).length, 366);
  assert.equal(classified.filter(q => new Set(q.relatedTopics.map(id => unitByTopic.get(id))).size > 1).length, 210);
});

test("a saved topic override becomes the displayed and first related topic", () => {
  const question = { ...catalog.questions[0], status: "review", primaryTopic: "1.1", relatedTopics: ["1.1", "3.4", "8.3"] };
  const [result] = deriveCatalogQuestions([question], { [question.id]: "8.3" }, topics);
  assert.equal(result.status, "classified");
  assert.equal(result.displayTopic, "8.3");
  assert.equal(result.displayName, topics.find(topic => topic.id === "8.3").name);
  assert.deepEqual(result.relatedTopics, ["8.3", "3.4"]);
  assert.deepEqual(question.relatedTopics, ["1.1", "3.4", "8.3"]);
});
