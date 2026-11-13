import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const baseline = JSON.parse(await read("../public/questions.json"));
const candidate = JSON.parse(await read("../docs/stage-3/questions.stage3-v1.json"));
const ledger = (await read("../docs/stage-3/catalog-decisions.jsonl")).trim().split("\n").map(line => JSON.parse(line));
const stimuli = JSON.parse(await read("../research/stimuli.json")).stimuli;

test("versioned catalog retains the baseline and contains only the 22 accepted additions", () => {
  const byId = new Map(candidate.questions.map(q => [q.id, q]));
  assert.equal(byId.size, 1564);
  assert.equal(candidate.questions.length, byId.size);
  assert.equal(candidate.stats.questions, byId.size);
  for (const record of baseline.questions) assert.deepEqual(byId.get(record.id), record);
  const baselineIds = new Set(baseline.questions.map(q => q.id));
  const additions = ledger.filter(row => row.disposition === "accepted_addition").map(row => row.id);
  assert.equal(additions.length, 22);
  assert.deepEqual([...byId.keys()].filter(id => !baselineIds.has(id)).sort(), additions.sort());
  assert.equal(ledger.filter(row => row.disposition === "pending_addition").length, 87);
  assert.equal(ledger.filter(row => row.disposition === "pending_shared_changes").length, 864);
  assert.deepEqual(candidate.sourceFiles, baseline.sourceFiles);
  for (const record of candidate.questions) {
    for (const page of record.sourcePagesOriginal ?? record.pages) {
      assert.ok(candidate.sourceFiles.some(file => file.from <= page && page <= file.to));
    }
  }
  const linked = candidate.questions.flatMap(q => (q.stimulusIds ?? []).map(id => [id, q.id]));
  const registered = Object.entries(stimuli).flatMap(([id, group]) => group.questionIds.map(q => [id, q]));
  assert.equal(Object.keys(stimuli).length, 6);
  assert.equal(linked.length, 17);
  assert.deepEqual(linked.sort(), registered.sort());
});
