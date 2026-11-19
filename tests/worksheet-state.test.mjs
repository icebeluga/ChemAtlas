import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const output = await build({
  stdin: {
    contents: 'export { planWorksheetRestore } from "./components/student/hooks/use-worksheets"; export { applyUndo, moveEntry, replaceEntry } from "./lib/worksheet-edits"; export { backupSchema, defaultFormat } from "./lib/worksheet"; export { mergeWorksheetBackup, WorksheetConflict } from "./components/student/hooks/worksheet-db";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
  },
  bundle: true, format: "esm", platform: "node", write: false,
});
const { applyUndo, defaultFormat, moveEntry, replaceEntry, planWorksheetRestore, backupSchema, mergeWorksheetBackup, WorksheetConflict } =
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);

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
  assert.deepEqual(restored, { backup: saved, recoveryNeeded: false });
  assert.equal(JSON.stringify(restored.backup), text);
});

test("missing and invalid backups start with one fresh draft", () => {
  for (const stored of [null, "{broken", '{"version":9}']) {
    const { backup, recoveryNeeded } = restore(stored, null);
    assert.equal(backup.active, "new-1");
    assert.deepEqual(backup.drafts, [{ ...draft("new-1"), name: "Untitled worksheet" }]);
    assert.equal(recoveryNeeded, stored !== null);
  }
});

test("legacy selection migrates to its own draft alongside a valid backup", () => {
  const saved = backup(draft("A", [entry("already")]), draft("B"));
  const result = restore(JSON.stringify(saved), JSON.stringify(["x", "", 42, "a".repeat(201), "y", "x"]));
  assert.equal(result.backup.drafts[2].name, "Imported Question Bank selection");
  assert.equal(result.backup.active, result.backup.drafts[2].id);
  assert.deepEqual(result.backup.drafts.slice(0, 2), saved.drafts);
  assert.deepEqual(result.backup.drafts[2].entries, [entry("x"), entry("y")]);
  assert.equal(result.recoveryNeeded, true, "unusable legacy entries are flagged for recovery");
});

test("legacy selection uses the current draft when no new draft is permitted", () => {
  const existing = Array.from({ length: 100 }, (_, i) => draft(`D-${i}`));
  const result = restore(JSON.stringify(backup(...existing)), '["legacy"]');
  assert.equal(result.backup.active, existing[0].id);
  assert.equal(result.backup.drafts.length, 100);
  assert.deepEqual(result.backup.drafts[0].entries, [entry("legacy")]);
  assert.deepEqual(restore(null, '["legacy"]').backup.drafts[0].entries, [entry("legacy")]);
});

test("partial migration restores what fits and flags the archived remainder", () => {
  const entries = Array.from({ length: 499 }, (_, i) => entry(`q-${i}`));
  const existing = [draft("D", entries), ...Array.from({ length: 99 }, (_, i) => draft(`Other-${i}`))];
  const result = restore(JSON.stringify(backup(...existing)), '["first","overflow"]');
  assert.deepEqual(result.backup.drafts[0].entries, [...entries, entry("first")]);
  assert.equal(result.recoveryNeeded, true);
});

test("fractional edits are rejected by the persistent backup schema", () => {
  const saved = backup(draft("A", [entry("a", false, 2)]), draft("B", [entry("b", false, 4)]));
  const edit = { ...saved, drafts: [saved.drafts[0], draft("B", [entry("b", false, 1.5)])] };
  assert.equal(backupSchema.safeParse(edit).success, false);
  assert.throws(() => mergeWorksheetBackup(saved, edit, saved), WorksheetConflict);
  assert.equal(saved.drafts[1].entries[0].lines, 4);
});

test("restore repairs fractional lines without changing other draft data", () => {
  const a = draft("A", [entry("a1", true, 5), entry("a2")], { title: "Keep me" });
  const corrupt = { version: 1, active: "B", drafts: [a, draft("B", [entry("b1", false, 1.5), entry("b2")])] };
  const restored = restore(JSON.stringify(corrupt), null);
  assert.deepEqual(restored.backup, { version: 1, active: "B", drafts: [a, draft("B", [entry("b1", false, 2), entry("b2")])] });
  assert.equal(restored.recoveryNeeded, true);
});

test("an unrepairable draft is flagged for recovery and valid drafts remain available", () => {
  const a = draft("A", [entry("a1")]);
  const broken = draft("B", [entry("dup"), entry("dup")]);
  assert.deepEqual(restore(JSON.stringify({ version: 1, active: "B", drafts: [a, broken] }), null),
    { backup: backup(a), recoveryNeeded: true });
});

test("legacy selections already imported by the older app are not duplicated", () => {
  const saved = backup(draft("A"), { ...draft("B", [entry("x"), entry("y")]), name: "Imported Question Bank selection" });
  assert.deepEqual(restore(JSON.stringify(saved), '["x","y"]'), { backup: saved, recoveryNeeded: false });
});

test("reconciliation preserves independently added drafts and edits to distinct fields", () => {
  const a = draft("A");
  const original = backup(a);
  const aRenamed = { ...a, name: "Renamed" };
  const aWithEntry = { ...a, entries: [entry("selected")] };
  const concurrent = { ...backup(aWithEntry, draft("B")), active: "B" };
  const result = mergeWorksheetBackup(original, backup(aRenamed), concurrent);
  assert.deepEqual(result, { ...concurrent, drafts: [{ ...aWithEntry, name: "Renamed" }, draft("B")] });
  assert.throws(() => mergeWorksheetBackup(original, backup(aRenamed), backup({ ...a, name: "Different rename" })), WorksheetConflict);
});

test("undo reverses a reorder without discarding a later rename", () => {
  const original = draft("D", [entry("a"), entry("b"), entry("c")]);
  const moved = moveEntry(original, 0, 2);
  const step = { before: original, after: moved };
  const renamed = { ...moved, name: "Renamed later" };
  const undone = applyUndo(renamed, step);
  assert.deepEqual(undone.entries.map(e => e.id), ["a", "b", "c"]);
  assert.equal(undone.name, "Renamed later");
  assert.equal(undone.format, renamed.format);
});

test("undo keeps later format edits after an entry change and later entry edits after a preset", () => {
  const original = draft("D", [entry("a"), entry("b")]);
  const removed = { ...original, entries: [entry("a")] };
  const formatted = { ...removed, format: { ...removed.format, paper: "A4" } };
  const undone = applyUndo(formatted, { before: original, after: removed });
  assert.deepEqual(undone.entries, original.entries);
  assert.equal(undone.format.paper, "A4");

  const preset = { ...original, format: { ...defaultFormat, lines: 6 } };
  const renamed = { ...preset, name: "After preset" };
  const reverted = applyUndo(renamed, { before: original, after: preset });
  assert.equal(reverted.format, original.format);
  assert.equal(reverted.name, "After preset");
});

test("undo becomes unavailable after an incompatible edit to the same field or on another draft", () => {
  const original = draft("D", [entry("a"), entry("b")]);
  const moved = moveEntry(original, 0, 1);
  const step = { before: original, after: moved };
  assert.equal(applyUndo({ ...moved, entries: [...moved.entries, entry("c")] }, step), undefined);
  const preset = { ...original, format: { ...defaultFormat, lines: 6 } };
  assert.equal(applyUndo({ ...preset, format: { ...preset.format, title: "Edited" } }, { before: original, after: preset }), undefined);
  assert.equal(applyUndo(draft("Other"), step), undefined);
  assert.equal(applyUndo(moved, undefined), undefined);
});
