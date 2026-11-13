import assert from "node:assert/strict";
import test from "node:test";
import { buildChemAtlasUrl, parseChemAtlasLocation } from "../app/navigation.mjs";

test("the library deep link is recognized and malformed filters are ignored", () => {
  const route = parseChemAtlasLocation("?view=library&unit=u3&topic=8.3&type=FRQ&q=buffer");
  assert.deepEqual(route, {
    view: "library", unit: "u3", topic: "8.3", type: "FRQ", query: "buffer",
    questionId: "", sessionIds: [], step: 0,
  });
  assert.equal(parseChemAtlasLocation("?view=library&unit=u23&type=WRONG").unit, "all");
  assert.equal(parseChemAtlasLocation("?view=unknown").view, "desk");
});

test("unit navigation preserves unrelated parameters and encodes the selected unit", () => {
  const url = buildChemAtlasUrl("https://example.test/?campaign=fall", "library", { unit: "u3", topic: "all" });
  assert.equal(url, "/?campaign=fall&view=library&unit=u3");
});

test("detail routes carry a stable question ID and retain the catalog filters", () => {
  const url = buildChemAtlasUrl("https://example.test/?view=library&unit=u4&type=MCQ", "detail", { questionId: "mcq-2018-12-44" });
  assert.equal(url, "/?view=detail&unit=u4&type=MCQ&question=mcq-2018-12-44");
  assert.equal(parseChemAtlasLocation(url).questionId, "mcq-2018-12-44");
});

test("returning from a question detail restores its shareable catalog filters", () => {
  const detail = buildChemAtlasUrl("https://example.test/?view=library&unit=u4&topic=4.2&type=MCQ&q=equilibrium", "detail", { questionId: "mcq-2018-12-44" });
  const catalog = buildChemAtlasUrl(`https://example.test${detail}`, "library");
  const route = parseChemAtlasLocation(new URL(catalog, "https://example.test").search);
  assert.deepEqual({ view: route.view, unit: route.unit, topic: route.topic, type: route.type, query: route.query, questionId: route.questionId }, {
    view: "library", unit: "u4", topic: "4.2", type: "MCQ", query: "equilibrium", questionId: "",
  });
});

test("practice routes can restore a bounded question queue and current index", () => {
  const ids = ["mcq-a", "frq-b", "mcq-c"];
  const url = buildChemAtlasUrl("https://example.test/?view=builder", "practice", { questionId: ids[1], sessionIds: ids, step: 1 });
  assert.deepEqual(parseChemAtlasLocation(url).sessionIds, ids);
  assert.equal(parseChemAtlasLocation(url).step, 1);
  const capped = buildChemAtlasUrl("https://example.test/", "practice", { sessionIds: Array.from({length: 40}, (_, i) => `q${i}`), step: 40 });
  assert.equal(parseChemAtlasLocation(capped).sessionIds.length, 30);
  assert.equal(parseChemAtlasLocation(capped).step, 29);
});

test("returning to Browse by Unit clears catalog and session state", () => {
  const url = buildChemAtlasUrl("https://example.test/?view=practice&unit=u3&question=q1&session=q1,q2&step=1", "desk");
  assert.equal(url, "/");
});
