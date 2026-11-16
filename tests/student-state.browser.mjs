// Run against a local, built student Worker with its signed Access fixture:
// CHEMATLAS_TEST_ORIGIN and CHEMATLAS_TEST_ACCESS_TOKEN must be set.
// Browser tooling uses the same CHEMATLAS_PLAYWRIGHT and CHEMATLAS_CHROMIUM as release smoke.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const loadBrowser = createRequire(import.meta.url);
const { chromium } = loadBrowser(process.env.CHEMATLAS_PLAYWRIGHT || "playwright");
const origin = new URL(process.env.CHEMATLAS_TEST_ORIGIN);
const token = process.env.CHEMATLAS_TEST_ACCESS_TOKEN;
assert.equal(origin.hostname, "127.0.0.1");
assert.ok(token, "A local Access fixture token is required");

test("restores drafts and legacy progress and cancels superseded PDF previews", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHEMATLAS_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let releaseRequest;
  const blockedRequest = new Promise(resolve => { releaseRequest = resolve; });

  try {
    await page.route(`${origin.origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), "cf-access-jwt-assertion": token },
    }));
    await page.addInitScript(() => {
      window.previewAudit = { created: [], revoked: [], aborted: 0 };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        const url = create(blob);
        if (blob.type === "application/pdf") window.previewAudit.created.push(url);
        return url;
      };
      URL.revokeObjectURL = url => {
        window.previewAudit.revoked.push(url);
        revoke(url);
      };
      const fetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (input === "/worksheet-fragments.pdf") {
          init?.signal?.addEventListener("abort", () => { window.previewAudit.aborted += 1; }, { once: true });
        }
        return fetch(input, init);
      };

      if (sessionStorage.getItem("test-seeded")) return;
      sessionStorage.setItem("test-seeded", "yes");
      localStorage.setItem("chematlas-student-worksheet-v1", JSON.stringify(["mcq-2018-23-2039"]));
      localStorage.setItem("apchem-studio-v1", JSON.stringify({ progress: {
        "mcq-2018-23-2039": { attempts: 1, wrong: 1, history: [{ date: "2026-11-01", correct: false }] },
        "mcq-2008-1-29": { attempts: 1, correct: 1, history: [{ date: "2026-11-02", correct: true }] },
      } }));
      localStorage.setItem("apchem-studio-v2", JSON.stringify({ progress: {
        "mcq-2018-23-2039": { attempts: 3, correct: 3, wrong: 0, last: "2026-11-03", history: [] },
      }, sessions: 2 }));
    });
    const response = await page.goto(new URL("/practice-builder", origin).href);
    assert.equal(response?.status(), 200);
    assert.match(await response.text(), /Loading Practice Builder/);
    await page.getByText("1 selected", { exact: true }).waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("apchem-studio-v2")).progress["mcq-2008-1-29"]);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apchem-studio-v2")));
    assert.equal(saved.progress["mcq-2018-23-2039"].attempts, 3);
    assert.deepEqual(saved.progress["mcq-2008-1-29"].history, [{ date: "2026-11-02", result: "correct" }]);
    assert.equal(saved.sessions, 2);
    assert.equal(await page.evaluate(() => localStorage.getItem("chematlas-student-worksheet-v1")), null);

    const worksheetTitle = page.getByRole("textbox", { name: "Worksheet title" });
    await worksheetTitle.fill("Saved practice draft");
    const draftsBeforeReload = await page.evaluate(() => localStorage.getItem("chematlas-worksheets-v1"));
    await page.reload();
    await page.getByText("1 selected", { exact: true }).waitFor();
    assert.equal(await worksheetTitle.inputValue(), "Saved practice draft");
    assert.equal(await page.evaluate(() => localStorage.getItem("chematlas-worksheets-v1")), draftsBeforeReload);

    const steps = page.getByRole("group", { name: "Builder view" });
    const exportStep = steps.getByRole("button", { name: "Preview", exact: true });
    const download = page.getByRole("link", { name: "Download PDF" });
    await download.waitFor();
    const initialUrl = await download.getAttribute("href");
    await steps.getByRole("button", { name: "Add questions", exact: true }).click();
    await page.waitForFunction(url => window.previewAudit.revoked.includes(url), initialUrl);
    await page.getByRole("textbox", { name: "Search" }).fill("no-match-worksheet-fixture-2026");
    await page.getByText("0 matches", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByRole("button", { name: "Add to Worksheet" }).first().waitFor();
    await page.evaluate(() => { window.previewAudit = { created: [], revoked: [], aborted: 0 }; });

    let first = true;
    await page.route(`${origin.origin}/worksheet-fragments.pdf`, async route => {
      if (first) {
        first = false;
        await blockedRequest;
      }
      await route.fallback();
    });
    const firstPreview = page.waitForRequest(`${origin.origin}/worksheet-fragments.pdf`);
    await exportStep.click();
    await firstPreview;
    const mode = page.getByRole("combobox", { name: "PDF contents" });
    await mode.selectOption("answers");
    await page.waitForFunction(() => window.previewAudit.aborted === 1);
    releaseRequest();
    await download.waitFor();
    assert.match(await download.getAttribute("download"), / - answer key\.pdf$/);
    const answerUrl = await download.getAttribute("href");
    assert.deepEqual(await page.evaluate(() => window.previewAudit.created), [answerUrl]);

    await steps.getByRole("button", { name: "Layout", exact: true }).click();
    await page.waitForFunction(url => window.previewAudit.revoked.includes(url), answerUrl);
    const printedTitle = page.getByRole("textbox", { name: "Title", exact: true });
    await printedTitle.fill("Intermediate title");
    await printedTitle.fill("Final worksheet title");
    await exportStep.click();
    await mode.selectOption("questions");
    await download.waitFor();
    assert.equal(await download.getAttribute("download"), "Final worksheet title.pdf");
    await page.locator(".worksheet-preview canvas[data-painted]").waitFor();

    await mode.selectOption("answers");
    await page.getByRole("button", { name: "Remove question 1", exact: true }).click();
    await page.getByText("0 selected", { exact: true }).waitFor();
    await exportStep.click();
    await page.getByText("This worksheet has no verified answer key.", { exact: true }).waitFor();
    assert.equal(await mode.inputValue(), "questions");
    assert.equal(await mode.locator('option[value="answers"]').evaluate(option => option.disabled), true);
    assert.equal(await download.count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    releaseRequest();
    await browser.close();
  }
});

test("fractional response lines never corrupt saved drafts, and a corrupt backup is repaired and preserved", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHEMATLAS_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const key = "chematlas-worksheets-v1";
  const recoveryKey = "chematlas-worksheets-v1-recovery";
  try {
    await page.route(`${origin.origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), "cf-access-jwt-assertion": token },
    }));
    await page.goto(new URL("/practice-builder", origin).href);
    await page.getByText("0 selected", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Worksheet title" }).fill("Format source"); // first save writes the default format
    const format = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).drafts[0].format, key);
    const seed = lines => ({ version: 1, active: "draft-b", drafts: [
      { id: "draft-a", name: "Draft A", format, entries: [{ id: "mcq-2008-1-29", breakBefore: false }] },
      { id: "draft-b", name: "Draft B", format, entries: [{ id: "frq-2005-1-6", breakBefore: false, ...(lines === undefined ? {} : { lines }) }] },
    ] });
    const stored = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    const options = page.locator("select").filter({ has: page.locator('option[value="draft-a"]') });

    // Typing a fractional value saves a whole number and keeps both drafts across a reload.
    await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [key, JSON.stringify(seed())]);
    await page.reload();
    await page.getByText("1 selected", { exact: true }).waitFor();
    await page.locator("details.ca-b-options summary").first().click();
    await page.getByRole("spinbutton", { name: "Response lines" }).fill("1.5");
    await page.waitForFunction(k => JSON.parse(localStorage.getItem(k)).drafts[1].entries[0].lines !== undefined, key);
    assert.equal((await stored()).drafts[1].entries[0].lines, 2);
    await page.reload();
    await page.getByText("1 selected", { exact: true }).waitFor();
    assert.equal(await options.locator("option").count(), 2);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), recoveryKey), null);

    // A backup written by the defective build is repaired on load, kept raw, and survives the next edit.
    const corrupt = JSON.stringify(seed(1.5));
    await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [key, corrupt]);
    await page.reload();
    await page.getByText("1 selected", { exact: true }).waitFor();
    assert.equal(await options.locator("option").count(), 2);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), recoveryKey), corrupt);
    await page.getByRole("textbox", { name: "Worksheet title" }).fill("Draft B edited");
    await page.waitForFunction(k => JSON.parse(localStorage.getItem(k)).drafts[1].name === "Draft B edited", key);
    const after = await stored();
    assert.deepEqual(after.drafts.map(d => d.id), ["draft-a", "draft-b"]);
    assert.deepEqual(after.drafts[0].entries, [{ id: "mcq-2008-1-29", breakBefore: false }]);
    assert.equal(after.drafts[1].entries[0].lines, 2);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), recoveryKey), corrupt);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("an older recovery backup cannot authorize replacing a different damaged collection", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHEMATLAS_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route(`${origin.origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), "cf-access-jwt-assertion": token },
    }));
    const key = "chematlas-worksheets-v1";
    const recoveryKey = `${key}-recovery`;
    const legacyKey = "chematlas-student-worksheet-v1";
    const older = "{older backup";
    await page.goto(new URL("/practice-builder", origin).href);
    const title = page.getByRole("textbox", { name: "Worksheet title", exact: true });
    await title.fill("Format source");
    const format = await page.waitForFunction(k => JSON.parse(localStorage.getItem(k))?.drafts[0].format, key)
      .then(handle => handle.jsonValue());
    const duplicate = { id: "frq-2005-1-6", breakBefore: false };
    const newer = JSON.stringify({ version: 1, active: "draft-a", drafts: [
      { id: "draft-a", name: "Draft A", format, entries: [] },
      { id: "draft-b", name: "Newer-only B", format, entries: [duplicate, duplicate, { id: "mcq-2008-1-29", breakBefore: false }] },
    ] });
    await page.evaluate(([key, recoveryKey, newer, older]) => {
      localStorage.setItem(key, newer);
      localStorage.setItem(recoveryKey, older);
    }, [key, recoveryKey, newer, older]);
    await page.reload();
    await title.fill("Edited A");
    const warning = page.getByRole("status").filter({ hasText: "Draft changes could not be saved" });
    await warning.waitFor();
    assert.equal(await title.inputValue(), "Edited A");
    const readKeys = () => page.evaluate(keys => keys.map(k => localStorage.getItem(k)), [key, recoveryKey, legacyKey]);
    assert.deepEqual(await readKeys(), [newer, older, null]);

    const legacy = JSON.stringify(["mcq-2008-1-29"]);
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [legacyKey, legacy]);
    await page.reload();
    await warning.waitFor();
    assert.deepEqual(await readKeys(), [newer, older, legacy]);
  } finally {
    await browser.close();
  }
});
