// Run against a local, built student Worker with its signed Access fixture:
// CHEMATLAS_TEST_ORIGIN and CHEMATLAS_TEST_ACCESS_TOKEN must be set.
// Browser tooling uses the same CHEMATLAS_PLAYWRIGHT and CHEMATLAS_CHROMIUM as release smoke.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pauseWorksheetWrites, readWorksheetValue, waitForWorksheet } from "./fixtures/worksheet-browser.mjs";

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
    assert.equal(await page.evaluate(() => localStorage.getItem("chematlas-student-worksheet-v1")), '["mcq-2018-23-2039"]');

    const worksheetTitle = page.getByRole("textbox", { name: "Worksheet title" });
    await worksheetTitle.fill("Saved practice draft");
    const draftsBeforeReload = await waitForWorksheet(page, record => record.backup.drafts[0].name === "Saved practice draft");
    await page.reload();
    await page.getByText("1 selected", { exact: true }).waitFor();
    assert.equal(await worksheetTitle.inputValue(), "Saved practice draft");
    assert.deepEqual(await page.evaluate(readWorksheetValue, "current"), draftsBeforeReload);

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

const key = "chematlas-worksheets-v1";
const recoveryKey = `${key}-recovery`;
const legacyKey = "chematlas-student-worksheet-v1";
const builderPath = "/practice-builder";
const mcq = "mcq-2008-1-29";
const frq = "frq-2005-1-6";
const historicalFormat = {
  title: "AP Chemistry Practice", subtitle: "", paper: "Letter", landscape: false, margin: 36,
  font: 11, gap: 16, lines: 3, name: true, date: true, classField: false, numbering: true,
  citations: false, pageNumbers: true, references: false, grouping: "type", mcqTitle: "Multiple choice",
  frqTitle: "Free response", instructions: "",
};
const entry = id => ({ id, breakBefore: false });
const draft = (id, name, entries = [], format = historicalFormat) => ({ id, name, format, entries });
const collection = (drafts, active = drafts[0].id) => JSON.stringify({ version: 1, active, drafts });
const titleOf = page => page.getByRole("textbox", { name: "Worksheet title", exact: true });
const savedWorksheets = page => page.getByRole("combobox", { name: "Saved worksheets", exact: true });
const currentRecord = page => page.evaluate(readWorksheetValue, "current");
const originalKeys = page => page.evaluate(keys => keys.map(k => localStorage.getItem(k)), [key, recoveryKey, legacyKey]);
const openBuilder = async context => {
  const page = await context.newPage();
  assert.equal((await page.goto(new URL(builderPath, origin).href))?.status(), 200);
  await titleOf(page).waitFor();
  return page;
};

async function downloadText(page, button) {
  const [file] = await Promise.all([page.waitForEvent("download"), button.click()]);
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function worksheetContext(t, { raw = null, recovery = null, legacy = null } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.CHEMATLAS_CHROMIUM });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(`${origin.origin}/**`, route => route.continue({
    headers: { ...route.request().headers(), "cf-access-jwt-assertion": token },
  }));
  await context.addInitScript(entries => {
    for (const [name, value] of entries) if (value !== null && localStorage.getItem(name) === null) localStorage.setItem(name, value);
  }, [[key, raw], [recoveryKey, recovery], [legacyKey, legacy]]);
  return context;
}

test("legacy writes from the previous storage implementation remain discoverable across reloads", async t => {
  const raw = collection([draft("draft-a", "Draft A")]);
  const context = await worksheetContext(t, { raw });
  const page = await openBuilder(context);
  const initial = await currentRecord(page);
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  const bundle = await build({
    stdin: {
      contents: `
        import { restoreWorksheetBackup, useWorksheets } from "./tests/fixtures/legacy-worksheets";
        import { newDraft } from "./lib/worksheet";
        document.querySelector("button").onclick = () => {
          const before = restoreWorksheetBackup();
          const draft = newDraft(document.querySelector("input").value);
          const { save } = useWorksheets(before, () => {}, message => { throw new Error(message); });
          save({ ...before, active: draft.id, drafts: [...before.drafts, draft] });
        };
      `,
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    },
    bundle: true, write: false, platform: "browser",
  });
  await context.route(`${origin.origin}/legacy-worksheets-fixture`, route => route.fulfill({
    contentType: "text/html",
    body: `<label>Older draft title<input></label><button>Save older draft</button><script>${bundle.outputFiles[0].text}</script>`,
  }));
  async function writeFromOlderBuild(name) {
    const old = await context.newPage();
    await old.goto(`${origin.origin}/legacy-worksheets-fixture`);
    await old.getByLabel("Older draft title").fill(name);
    await old.getByRole("button", { name: "Save older draft" }).click();
    const [saved] = await originalKeys(old);
    assert.ok(JSON.parse(saved).drafts.some(draft => draft.name === name));
    await old.close();
    return saved;
  }

  const updated = await writeFromOlderBuild("Late legacy draft");
  const warning = page.getByRole("status").filter({ hasText: "Older worksheet storage changed" });
  await warning.waitFor();
  await page.reload();
  await titleOf(page).waitFor();
  await warning.waitFor();
  assert.deepEqual(await currentRecord(page), initial);
  const changedButton = page.getByRole("button", { name: "Download changed legacy saved worksheets", exact: true });
  const changed = JSON.parse(await downloadText(page, changedButton));
  assert.deepEqual(changed.drafts.map(draft => draft.name), ["Late legacy draft"]);
  const exact = await downloadText(page, page.getByRole("button", { name: "Download exact legacy saved worksheets data", exact: true }));
  assert.equal(exact, updated);
  assert.deepEqual(await page.evaluate(readWorksheetValue, "migration"), { collection: raw, recovery: null, legacySelection: null });
  await page.locator("details.ca-b-more summary").click();
  await page.getByLabel("Import drafts").setInputFiles({
    name: "legacy-recovery.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changed)),
  });
  await page.getByText("Worksheet drafts imported.", { exact: true }).waitFor();
  const recovered = await currentRecord(page);
  assert.deepEqual(recovered.backup.drafts.map(draft => draft.name), ["Draft A", "Late legacy draft"]);

  const idle = await openBuilder(context);
  const idleWarning = idle.getByRole("status").filter({ hasText: "Older worksheet storage changed" });
  await idleWarning.waitFor();
  await page.getByRole("button", { name: "Acknowledge legacy changes" }).click();
  await warning.waitFor({ state: "hidden" });
  await idleWarning.waitFor({ state: "hidden" });
  await page.reload();
  await titleOf(page).waitFor();
  assert.equal(await warning.count(), 0);
  const latest = await writeFromOlderBuild("Post-acknowledgment draft");
  await warning.waitFor();
  const next = JSON.parse(await downloadText(page, changedButton));
  assert.deepEqual(next.drafts.map(draft => draft.name), ["Post-acknowledgment draft"]);
  assert.deepEqual(await currentRecord(page), recovered);
  assert.deepEqual(await originalKeys(page), [latest, null, null]);
});

test("a delayed import at capacity stays separately downloadable and subsequent edits survive reload", async t => {
  const drafts = Array.from({ length: 99 }, (_, i) => draft(`draft-${i}`, `Draft ${i}`));
  const context = await worksheetContext(t, { raw: collection(drafts) });
  const page = await openBuilder(context);
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      const bytes = await read.call(this);
      if (this.name === "delayed-import.json") await new Promise(resolve => { window.resumeWorksheetImport = resolve; });
      return bytes;
    };
  });
  const input = page.getByLabel("Import drafts");
  const menu = page.locator("details.ca-b-more");
  await menu.locator("summary").click();
  await input.setInputFiles({
    name: "delayed-import.json", mimeType: "application/json",
    buffer: Buffer.from(collection([draft("rejected-id", "Uncommitted legacy copy", [entry(mcq)])])),
  });
  await page.waitForFunction(() => typeof window.resumeWorksheetImport === "function");
  await page.getByText("Importing worksheet drafts…", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))), true);
  await page.getByRole("button", { name: "New worksheet", exact: true }).click();
  await titleOf(page).fill("Worksheet 100");
  await waitForWorksheet(page, ({ backup }) => backup.drafts.length === 100 && backup.drafts.at(-1).name === "Worksheet 100");
  await page.evaluate(() => window.resumeWorksheetImport());
  await page.getByRole("status").filter({ hasText: "Import would exceed the 100-worksheet limit" }).waitFor();
  assert.equal(await page.getByText("Worksheet drafts imported.", { exact: true }).count(), 0);
  assert.ok(await input.isDisabled());

  await titleOf(page).fill("Later committed rename");
  const renamed = await waitForWorksheet(page, ({ backup }) => backup.drafts.at(-1).name === "Later committed rename");
  const pending = JSON.parse(await downloadText(page, page.getByRole("button", { name: "Download pending import", exact: true })));
  assert.deepEqual(pending.drafts.map(draft => [draft.id, draft.name, draft.entries]), [["rejected-id", "Uncommitted legacy copy", [entry(mcq)]]]);
  if (!await menu.evaluate(element => element.open)) await menu.locator("summary").click();
  const ordinary = JSON.parse(await downloadText(page, menu.getByRole("button", { name: "Download drafts", exact: true })));
  assert.deepEqual(ordinary, renamed.backup);
  assert.equal(ordinary.drafts.some(draft => draft.id === "rejected-id"), false);

  let prompted = false;
  page.once("dialog", async dialog => {
    prompted = dialog.type() === "beforeunload";
    await dialog.accept();
  });
  await page.reload();
  assert.ok(prompted, "reloading with a retained import requires confirmation");
  await titleOf(page).waitFor();
  assert.equal(await titleOf(page).inputValue(), "Later committed rename");
  assert.deepEqual(await currentRecord(page), renamed);
});

test("import success waits for IndexedDB commit and a failed import leaves the saved collection intact", async t => {
  const context = await worksheetContext(t, { raw: collection([draft("draft-a", "Draft A")]) });
  const page = await openBuilder(context);
  const menu = page.locator("details.ca-b-more");
  const input = page.getByLabel("Import drafts");
  const upload = (name, title) => input.setInputFiles({
    name, mimeType: "application/json", buffer: Buffer.from(collection([draft("import-id", title, [entry(mcq)])])),
  });
  await menu.locator("summary").click();
  const resume = await pauseWorksheetWrites(page);
  try {
    await upload("worksheets.json", "Committed import");
    await page.getByText("Importing worksheet drafts…", { exact: true }).waitFor();
    assert.equal(await page.getByText("Worksheet drafts imported.", { exact: true }).count(), 0);
    assert.equal(await savedWorksheets(page).locator("option").count(), 1);
  } finally { await resume(); }
  await page.getByText("Worksheet drafts imported.", { exact: true }).waitFor();
  const committed = await currentRecord(page);
  assert.equal(committed.backup.drafts.at(-1).name, "Committed import");
  assert.notEqual(committed.backup.drafts.at(-1).id, "import-id");

  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "worksheets" && key === "current") throw new DOMException("Injected quota error", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await upload("quota-import.json", "Quota import");
  await page.getByRole("status").filter({ hasText: "The import could not be saved." }).waitFor();
  assert.equal(await page.getByText("Worksheet drafts imported.", { exact: true }).count(), 0);
  assert.deepEqual(await currentRecord(page), committed);
  const pending = JSON.parse(await downloadText(page, page.getByRole("button", { name: "Download pending import", exact: true })));
  assert.equal(pending.drafts[0].name, "Quota import");
  await page.getByRole("button", { name: "Discard pending import", exact: true }).click();
  assert.ok(await input.isEnabled());
});

test("a historical two-draft collection accepts fractional input safely and survives reload", async t => {
  const a = draft("draft-a", "Draft A", [entry(mcq)], { ...historicalFormat, paper: "A4", landscape: true });
  const b = draft("draft-b", "Draft B", [entry(frq)]);
  const raw = collection([a, b], b.id);
  const context = await worksheetContext(t, { raw });
  const page = await openBuilder(context);
  assert.equal(await titleOf(page).inputValue(), b.name);
  await page.locator("details.ca-b-options summary").first().click();
  await page.getByRole("spinbutton", { name: "Response lines" }).fill("1.5");
  const after = await waitForWorksheet(page, ({ backup }) => backup.drafts[1].entries[0].lines === 2);
  assert.deepEqual(after.backup.drafts[0], { ...a, format: { ...a.format, mcqInstructions: "", frqInstructions: "" } });
  await page.reload();
  await savedWorksheets(page).waitFor();
  assert.equal(await savedWorksheets(page).locator("option").count(), 2);
  assert.deepEqual(await currentRecord(page), after);
  assert.deepEqual(await originalKeys(page), [raw, null, null]);
});

test("a fractional historical override is repaired and archived without rewriting its original", async t => {
  const raw = collection([draft("draft-a", "Draft A", [entry(mcq)]),
    draft("draft-b", "Draft B", [{ ...entry(frq), lines: 1.5 }])], "draft-b");
  const context = await worksheetContext(t, { raw });
  const page = await openBuilder(context);
  assert.equal(await savedWorksheets(page).locator("option").count(), 2);
  await titleOf(page).fill("Edited B");
  const { backup } = await waitForWorksheet(page, record => record.backup.drafts[1].name === "Edited B");
  assert.deepEqual(backup.drafts.map(item => item.id), ["draft-a", "draft-b"]);
  assert.deepEqual(backup.drafts[0].entries, [entry(mcq)]);
  assert.equal(backup.drafts[1].entries[0].lines, 2);
  assert.deepEqual(await originalKeys(page), [raw, null, null]);
  assert.deepEqual(await page.evaluate(readWorksheetValue, "migration"), { collection: raw, recovery: null, legacySelection: null });
});

test("a distinct occupied recovery copy and damaged main collection both survive edits and one-time legacy migration", async t => {
  const older = "{older backup";
  const newer = collection([draft("draft-a", "Draft A"),
    draft("draft-b", "Newer-only B", [entry(frq), entry(frq), entry(mcq)])]);
  const legacy = JSON.stringify([mcq]);
  const context = await worksheetContext(t, { raw: newer, recovery: older, legacy });
  const page = await openBuilder(context);
  await page.getByRole("status").filter({ hasText: "The original browser data is preserved" }).waitFor();
  await savedWorksheets(page).selectOption("draft-a");
  await titleOf(page).fill("Edited A");
  const edited = await waitForWorksheet(page, record => record.backup.drafts[0].name === "Edited A");
  assert.equal(edited.backup.drafts.length, 2);
  assert.equal(edited.backup.drafts[1].name, "Imported Question Bank selection");
  assert.deepEqual(edited.backup.drafts[1].entries, [entry(mcq)]);
  assert.deepEqual(await originalKeys(page), [newer, older, legacy]);
  assert.deepEqual(await page.evaluate(readWorksheetValue, "migration"), { collection: newer, recovery: older, legacySelection: legacy });
  await page.reload();
  await titleOf(page).waitFor();
  assert.deepEqual(await currentRecord(page), edited);
  assert.deepEqual(await originalKeys(page), [newer, older, legacy]);
});

test("malformed primary bytes survive fallback to a valid recovery collection", async t => {
  const raw = "{malformed";
  const recovery = collection([draft("recovery-a", "Recovered A")]);
  const context = await worksheetContext(t, { raw, recovery });
  const page = await openBuilder(context);
  assert.equal(await titleOf(page).inputValue(), "Recovered A");
  await titleOf(page).fill("Edited recovered draft");
  await waitForWorksheet(page, record => record.backup.drafts[0].name === "Edited recovered draft");
  assert.deepEqual(await originalKeys(page), [raw, recovery, null]);
  assert.deepEqual(await page.evaluate(readWorksheetValue, "migration"), { collection: raw, recovery, legacySelection: null });
});

test("two tabs opening on first migration share exactly one imported legacy draft", async t => {
  const raw = collection([draft("draft-a", "Draft A")]);
  const legacy = JSON.stringify([mcq]);
  const context = await worksheetContext(t, { raw, legacy });
  const pages = await Promise.all([openBuilder(context), openBuilder(context)]);
  const states = await Promise.all(pages.map(currentRecord));
  assert.deepEqual(states[0], states[1]);
  assert.equal(states[0].revision, 0);
  assert.equal(states[0].backup.drafts.length, 2);
  assert.deepEqual(states[0].backup.drafts[1].entries, [entry(mcq)]);
  assert.deepEqual(await originalKeys(pages[1]), [raw, null, legacy]);
});

test("migration quota failure rolls back both IndexedDB records and leaves all legacy bytes for retry", async t => {
  const raw = collection([draft("draft-a", "Draft A")]);
  const recovery = "{older backup";
  const legacy = JSON.stringify([mcq]);
  const context = await worksheetContext(t, { raw, recovery, legacy });
  await context.addInitScript(() => {
    if (sessionStorage.getItem("allow-worksheet-migration")) return;
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === "worksheets" && key === "current") throw new DOMException("Injected quota error", "QuotaExceededError");
      return add.call(this, value, key);
    };
  });
  const page = await openBuilder(context);
  const warning = page.getByRole("status").filter({ hasText: "Draft changes could not be saved" });
  await warning.waitFor();
  assert.equal(await currentRecord(page), undefined);
  assert.equal(await page.evaluate(readWorksheetValue, "migration"), undefined);
  await titleOf(page).fill("Memory-only edit");
  assert.equal(await titleOf(page).inputValue(), "Memory-only edit");
  assert.deepEqual(await originalKeys(page), [raw, recovery, legacy]);
  await page.evaluate(() => sessionStorage.setItem("allow-worksheet-migration", "yes"));
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await titleOf(page).waitFor();
  const saved = await currentRecord(page);
  assert.equal(saved.backup.drafts[0].name, "Draft A");
  assert.deepEqual(saved.backup.drafts[1].entries, [entry(mcq)]);
  assert.deepEqual(await originalKeys(page), [raw, recovery, legacy]);
});

test("a failed write leaves the committed IndexedDB revision intact and offers the unsaved work", async t => {
  const raw = collection([draft("draft-a", "Draft A")]);
  const context = await worksheetContext(t, { raw });
  const page = await openBuilder(context);
  const original = await currentRecord(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (this.name === "worksheets") throw new DOMException("Injected quota error", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await titleOf(page).fill("Unsaved title");
  const warning = page.getByRole("status").filter({ hasText: "Draft changes could not be saved" });
  await warning.getByRole("button", { name: "Download drafts" }).waitFor();
  assert.equal(await titleOf(page).inputValue(), "Unsaved title");
  assert.deepEqual(await currentRecord(page), original);
  assert.deepEqual(await originalKeys(page), [raw, null, null]);
});

test("IndexedDB unavailability keeps legacy drafts readable and prevents fallback writes", async t => {
  const raw = collection([draft("draft-a", "Draft A")]);
  const context = await worksheetContext(t, { raw });
  await context.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, version) {
      if (name === "chematlas-worksheets") throw new DOMException("Injected storage denial", "SecurityError");
      return open.call(this, name, version);
    };
  });
  const page = await openBuilder(context);
  assert.equal(await titleOf(page).inputValue(), "Draft A");
  await titleOf(page).fill("Memory-only edit");
  await page.getByRole("status").filter({ hasText: "Draft changes could not be saved" }).waitFor();
  assert.equal(await titleOf(page).inputValue(), "Memory-only edit");
  assert.deepEqual(await originalKeys(page), [raw, null, null]);
});

test("a new draft and a stale tab rename both commit and idle tabs synchronize", async t => {
  const raw = collection([draft("draft-a", "Draft A")]);
  const context = await worksheetContext(t, { raw });
  const tabA = await openBuilder(context);
  const tabB = await openBuilder(context);
  const resume = await pauseWorksheetWrites(tabA);
  try {
    await tabA.getByRole("button", { name: "New worksheet", exact: true }).click();
    await titleOf(tabA).fill("Worksheet B");
    await titleOf(tabB).fill("Renamed A");
  } finally { await resume(); }
  const saved = await waitForWorksheet(tabA, ({ backup }) =>
    backup.drafts[0].name === "Renamed A" && backup.drafts[1]?.name === "Worksheet B");
  assert.notEqual(saved.backup.drafts[1].id, "draft-a");
  await savedWorksheets(tabB).getByRole("option", { name: "Worksheet B" }).waitFor({ state: "attached" });
  await savedWorksheets(tabA).getByRole("option", { name: "Renamed A" }).waitFor({ state: "attached" });
  assert.equal(await titleOf(tabA).inputValue(), "Worksheet B");
  assert.equal(await titleOf(tabB).inputValue(), "Renamed A");
  assert.deepEqual(await originalKeys(tabB), [raw, null, null]);
});

test("simultaneous title conflicts keep the winner durable and the losing edit downloadable", async t => {
  const context = await worksheetContext(t, { raw: collection([draft("draft-a", "Draft A")]) });
  const tabs = [await openBuilder(context), await openBuilder(context)];
  const titles = ["Title from A", "Title from B"];
  const resume = await pauseWorksheetWrites(tabs[0]);
  try {
    await Promise.all(tabs.map((page, index) => titleOf(page).fill(titles[index])));
  } finally { await resume(); }
  const notices = tabs.map(page => page.getByRole("status").filter({ hasText: "Another tab changed this worksheet" }));
  const loser = await Promise.race(notices.map((notice, index) => notice.waitFor().then(() => index)));
  const record = await currentRecord(tabs[0]);
  assert.equal(record.revision, 1);
  assert.equal(record.backup.drafts[0].name, titles[1 - loser]);
  assert.equal(await titleOf(tabs[loser]).inputValue(), titles[loser]);
  const [download] = await Promise.all([
    tabs[loser].waitForEvent("download"),
    notices[loser].getByRole("button", { name: "Download drafts" }).click(),
  ]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  assert.equal(JSON.parse(Buffer.concat(chunks)).drafts[0].name, titles[loser]);
  await titleOf(tabs[1 - loser]).fill("Subsequent committed edit");
  await waitForWorksheet(tabs[1 - loser], ({ backup }) => backup.drafts[0].name === "Subsequent committed edit");
  assert.equal(await titleOf(tabs[loser]).inputValue(), titles[loser]);
});

test("Question Bank selection and a Builder edit to the same draft merge across tabs", async t => {
  const context = await worksheetContext(t, { raw: collection([draft("draft-a", "Draft A")]) });
  const builder = await openBuilder(context);
  const bank = await context.newPage();
  await bank.goto(new URL(`/?view=detail&question=${mcq}`, origin).href);
  const add = bank.getByRole("region", { name: "Printed question" }).getByRole("button", { name: "Add to worksheet", exact: true });
  await add.waitFor();
  const resume = await pauseWorksheetWrites(builder);
  try {
    await Promise.all([titleOf(builder).fill("From Builder"), add.click()]);
  } finally { await resume(); }
  const record = await waitForWorksheet(builder, ({ backup }) => backup.drafts[0].name === "From Builder" && backup.drafts[0].entries.length === 1);
  assert.deepEqual(record.backup.drafts[0].entries, [entry(mcq)]);
  await builder.getByText("1 selected", { exact: true }).waitFor();
});
