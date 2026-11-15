import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const output = await build({
  stdin: {
    contents: 'export { planWorksheetRestore } from "./components/student/hooks/use-worksheets"; export { moveEntry, replaceEntry } from "./lib/worksheet-edits"; export { defaultFormat } from "./lib/worksheet";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { defaultFormat, moveEntry, replaceEntry, planWorksheetRestore } =
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);

const legacyKey = "chematlas-student-worksheet-v1";
const worksheetKey = "chematlas-worksheets-v1";
const entry = (id, breakBefore = false, lines) => ({ id, breakBefore, ...(lines === undefined ? {} : { lines }) });
const draft = (id, entries = [], format = {}) => ({ id, name: id, format: { ...defaultFormat, ...format }, entries });
const backup = (...drafts) => ({ version: 1, active: drafts[0].id, drafts });
const restore = (saved, legacy) => {
  let nextId = 0;
  return planWorksheetRestore(saved, legacy, name => {
    const fresh = draft(`new-${++nextId}`);
    return { ...fresh, name: name ?? "Untitled worksheet" };
  });
};

test("moving an entry preserves order and leaves the original draft intact", () => {
  const original = draft("D", [entry("a", true, 4), entry("b"), entry("c")]);
  for (const [from, to] of [[0, 0], [-1, 1], [3, 1], [1, -1], [1, 3]]) {
    assert.equal(moveEntry(original, from, to), original);
  }
  assert.deepEqual(moveEntry(original, 0, 2).entries.map(e => e.id), ["b", "c", "a"]);
  assert.deepEqual(original.entries, [entry("a", true, 4), entry("b"), entry("c")]);
});

test("replacing an entry keeps its position and page break and clears its line override", () => {
  const original = draft("D", [entry("a"), entry("b", true, 4), entry("c")]);
  const result = replaceEntry(original, "b", "d");
  assert.deepEqual(result.entries.map(e => e.id), ["a", "d", "c"]);
  assert.equal(result.entries[1].breakBefore, true);
  assert.equal(result.entries[1].lines, undefined);
  assert.equal(result.entries[0], original.entries[0]);
  assert.equal(result.entries[2], original.entries[2]);
  assert.equal(original.entries[1].lines, 4);
});

test("a valid three-draft backup round trips byte-for-byte", () => {
  const saved = backup(
    draft("A", [entry("a", true, 5)]),
    draft("B", [entry("b", false, 0)], { paper: "A4", landscape: true }),
    draft("C", [entry("c")], { title: "Custom title", grouping: "topic" }),
  );
  const text = JSON.stringify(saved);
  const restored = restore(text, null);
  assert.deepEqual(restored, { backup: saved, writes: [], removals: [] });
  assert.equal(JSON.stringify(restored.backup), text);
});

test("missing and invalid backups start with one fresh draft", () => {
  for (const stored of [null, "{broken", '{"version":9}']) {
    const { backup, writes, removals } = restore(stored, null);
    assert.equal(backup.active, "new-1");
    assert.deepEqual(backup.drafts, [{ ...draft("new-1"), name: "Untitled worksheet" }]);
    assert.deepEqual(writes, []);
    assert.deepEqual(removals, []);
  }
});

test("legacy selection migrates to its own draft alongside a valid backup", () => {
  const saved = backup(draft("A", [entry("already")]), draft("B"));
  const result = restore(JSON.stringify(saved), JSON.stringify(["x", "", 42, "a".repeat(201), "y", "x"]));
  assert.equal(result.backup.drafts[2].name, "Imported Question Bank selection");
  assert.equal(result.backup.active, result.backup.drafts[2].id);
  assert.deepEqual(result.backup.drafts.slice(0, 2), saved.drafts);
  assert.deepEqual(result.backup.drafts[2].entries, [entry("x"), entry("y")]);
  assert.deepEqual(result.writes, [[worksheetKey, JSON.stringify(result.backup)]]);
  assert.deepEqual(result.removals, [legacyKey]);
});

test("legacy selection uses the current draft when no new draft is permitted", () => {
  const existing = Array.from({ length: 100 }, (_, i) => draft(`D-${i}`));
  const result = restore(JSON.stringify(backup(...existing)), '["legacy"]');
  assert.equal(result.backup.active, existing[0].id);
  assert.equal(result.backup.drafts.length, 100);
  assert.deepEqual(result.backup.drafts[0].entries, [entry("legacy")]);
  assert.deepEqual(restore(null, '["legacy"]').backup.drafts[0].entries, [entry("legacy")]);
});

test("partial migration writes what fits and keeps the legacy key for retry", () => {
  const entries = Array.from({ length: 499 }, (_, i) => entry(`q-${i}`));
  const existing = [draft("D", entries), ...Array.from({ length: 99 }, (_, i) => draft(`Other-${i}`))];
  const result = restore(JSON.stringify(backup(...existing)), '["first","overflow"]');
  assert.deepEqual(result.backup.drafts[0].entries, [...entries, entry("first")]);
  assert.deepEqual(result.writes, [[worksheetKey, JSON.stringify(result.backup)]]);
  assert.deepEqual(result.removals, []);
});
