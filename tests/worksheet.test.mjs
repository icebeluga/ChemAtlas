import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planWorksheet } from "../lib/worksheet.mjs";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const catalog = read("../public/questions.json");
const { stimuli } = read("../research/stimuli.json");
const group = catalog.questions.filter(question => question.stimulusIds?.includes("stimulus-2008-mcq-1-3-page29"));
const pages = question => question.sourcePagesOriginal ?? question.pages;

test("worksheet includes the 2008 Q1–3 shared stimulus once", () => {
  const plan = planWorksheet(group, stimuli, pages);
  assert.deepEqual(plan.map(entry => entry.segments.length), [2, 1, 1]);
  assert.equal(plan.flatMap(entry => entry.segments).filter(segment => segment.stimulusId).length, 1);
});

test("full source page fallback replaces duplicate page and stimulus segments", () => {
  const plan = planWorksheet([...group, { ...group[0], id: "fallback", sourceRegions: [] }], stimuli, pages);
  assert.deepEqual(plan.flatMap(entry => entry.segments), [{ page: 29, regions: [] }]);
});
