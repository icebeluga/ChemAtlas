import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const output = await build({
  stdin: { contents: 'export { filterQuestions } from "./lib/question-filter";', resolveDir: fileURLToPath(new URL("..", import.meta.url)) },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { filterQuestions } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalog = read("../public/student-questions.json");
const registry = read("../public/worksheet-sources.json");
const content = read("../public/worksheet-content.json");
const topics = catalog.units.flatMap(unit => unit.topics.map(([id, name]) => ({ id, name, unit: unit.id })));
const questions = catalog.questions.map(question => {
  const topic = question.primaryTopic ?? undefined;
  return {
    ...question, displayTopic: topic,
    relatedTopics: question.relatedTopics?.length ? question.relatedTopics : topic ? [topic] : [],
    displayName: topics.find(item => item.id === topic)?.name ?? question.topicName ?? "Needs classification",
  };
});
const progress = {
  "mcq-2008-1-29": { attempts: 1, wrong: 1 },
  "frq-2005-1-6": { attempts: 2, wrong: 0 },
  "mcq-2008-2-29": { attempts: 1, wrong: 0 },
};
const defaults = { unit: "all", topic: "all", type: "all", year: "all", source: "all", history: "all", print: "all", search: "" };
const unitForTopic = id => topics.find(topic => topic.id === id)?.unit;
const ids = records => records.map(question => question.id);

// Ordered IDs captured from the three inline predicates at 382b3c6.
for (const { name, options, bank, session, picker } of read("./fixtures/question-filter-before.json")) {
  test(`question filters match the original ${name} results`, () => {
    const f = { ...defaults, ...options };
    const base = { unit: f.unit, topic: f.topic, type: f.type, unitForTopic, include: q => !!f.includeReview || q.status === "classified" };
    assert.deepEqual(ids(filterQuestions(questions, {
      ...base, search: { query: f.search, text: q => `${q.year} ${q.exam} ${q.number} ${q.textPreview} ${q.displayName}` },
    })), bank, "Question Bank");
    assert.deepEqual(ids(filterQuestions(questions, {
      ...base, include: q => base.include(q) && (f.focus === "weak" ? (progress[q.id]?.wrong || 0) > 0 : !f.focus || q.relatedTopics.includes(f.focus)),
    })), session, "Practice session pool");
    assert.deepEqual(ids(filterQuestions(questions, {
      unit: f.unit.replace(/^U/i, ""), topic: f.topic, type: f.type,
      unitForTopic: id => id?.split(".")[0],
      topicsFor: q => q.relatedTopics.length ? q.relatedTopics : [q.displayTopic],
      include: q => (f.print !== "ready" || !!content.questions[q.id])
        && (f.year === "all" || (registry.questions[q.id]?.exam?.match(/^\d{4}/)?.[0] ?? q.year) === f.year)
        && (f.source === "all" || q.source === f.source)
        && (f.history === "all" || (f.history === "attempted" ? !!progress[q.id]?.attempts : !!progress[q.id]?.wrong)),
      search: { query: f.search.trim(), text: q => `${registry.questions[q.id]?.exam ?? q.exam} ${q.number} ${q.displayName} ${q.textPreview}` },
    })), picker, "Practice Builder picker");
  });
}

test("a non-primary related topic matches and supplies its own unit", () => {
  const question = { id: "cross-unit", type: "FRQ", primaryTopic: "1.1", primaryUnit: "u9", relatedTopics: ["1.1", "8.3"] };
  assert.deepEqual(filterQuestions([question], { unit: "u8", topic: "8.3", type: "all", unitForTopic }), [question]);
  assert.deepEqual(filterQuestions([question], { unit: "u9", topic: "8.3", type: "all", unitForTopic }), []);
});
