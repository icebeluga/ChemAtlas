import test from "node:test";
import assert from "node:assert/strict";
import { parseProgress, serializeProgress } from "../lib/progress-transfer.mjs";

test("round trip preserves question IDs, attempts, topic overrides, and sessions", () => {
  const original = {
    progress: {
      "mcq-2008-1-29": { attempts: 2, wrong: 1, correct: 1, last: "2026-11-12", history: [
        { date: "2026-11-10", result: "missed" }, { date: "2026-11-12", result: "correct" },
      ] },
    },
    overrides: { "mcq-2008-1-29": "2.7" }, sessions: 4,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(parseProgress(serializeProgress(original)))), original);
});
test("rejects invalid format and malformed imports", () => {
  assert.throws(() => parseProgress('{"format":"chematlas-browser-progress","version":99}'));
  assert.throws(() => parseProgress("not json"));
  assert.throws(() => parseProgress("x".repeat(2_000_001)));
});
test("rejects invalid nested attempt and imported script-like data", () => {
  assert.throws(() => parseProgress(JSON.stringify({
    format: "chematlas-browser-progress", version: 1,
    progress: { abc: { attempts: -1, wrong: 0, correct: 0, last: "", history: [] } },
    overrides: {}, sessions: 0,
  })));
});
