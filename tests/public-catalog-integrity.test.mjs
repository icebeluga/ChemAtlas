import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(await readFile(new URL("../public/questions.json", import.meta.url), "utf8"));
const questions = catalog.questions;
const topicIds = new Set(catalog.units.flatMap((unit) => unit.topics.map(([id]) => id)));

test("catalog has unique stable question IDs", () => {
  assert.ok(questions.length > 0);
  const ids = questions.map((question) => question.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
});

test("question types match the catalog's persisted totals", () => {
  const totals = questions.reduce((counts, question) => {
    assert.ok(question.type === "MCQ" || question.type === "FRQ", `Invalid type on ${question.id}`);
    counts[question.type] += 1;
    return counts;
  }, { MCQ: 0, FRQ: 0 });

  assert.equal(questions.length, catalog.stats.questions);
  assert.equal(totals.MCQ, catalog.stats.mcq);
  assert.equal(totals.FRQ, catalog.stats.frq);
  assert.equal(totals.MCQ + totals.FRQ, questions.length);
});

test("unit and topic assignments reference the curriculum", () => {
  assert.equal(catalog.units.length, 9);
  for (const question of questions) {
    if (question.primaryUnit) assert.ok(catalog.units.some((unit) => unit.id === question.primaryUnit), `${question.id} has unknown unit ${question.primaryUnit}`);
    for (const topicId of question.relatedTopics ?? []) assert.ok(topicIds.has(topicId), `${question.id} has unknown topic ${topicId}`);
  }
});

test("bundled source questions map to real PDF pages and assets", () => {
  const bundledFiles = new Set(catalog.sourceFiles.map((file) => file.url));
  for (const question of questions) {
    assert.ok(Array.isArray(question.pages) && question.pages.length > 0, `${question.id} has no source page`);
    assert.ok(question.pages.every((page) => Number.isInteger(page) && page > 0), `${question.id} has invalid page numbers`);
    if (question.sourceBank && question.sourceBank !== "mega") continue;
    const sourcePages = question.sourcePagesOriginal?.length ? question.sourcePagesOriginal : question.pages;
    for (const page of sourcePages) {
      assert.ok(catalog.sourceFiles.some((file) => page >= file.from && page <= file.to && bundledFiles.has(file.url)), `${question.id} page ${page} has no bundled PDF mapping`);
    }
  }
});
