// Run against the local UI server or the built Worker with its signed Access fixture.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHEMATLAS_PLAYWRIGHT || "playwright");
const origin = new URL(process.env.CHEMATLAS_TEST_ORIGIN);
assert.equal(origin.hostname, "127.0.0.1");

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHEMATLAS_CHROMIUM });
});
after(async () => browser?.close());

async function openPage(width, path = "/", seedIds = []) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const token = process.env.CHEMATLAS_TEST_ACCESS_TOKEN;
  if (token) {
    await page.route(`${origin.origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), "cf-access-jwt-assertion": token },
    }));
  }
  if (seedIds.length) {
    await page.addInitScript(ids => {
      if (!localStorage.getItem("chematlas-worksheets-v1")) {
        localStorage.setItem("chematlas-student-worksheet-v1", JSON.stringify(ids));
      }
    }, seedIds);
  }
  const response = await page.goto(new URL(path, origin).href);
  assert.equal(response?.status(), 200);
  return page;
}

function focus(locator) {
  return locator.evaluate(node => document.activeElement === node);
}

test("phone question pane restores row focus and scroll for all Back paths", async (t) => {
  const page = await openPage(390, "/?view=library&unit=u3&topic=3.4");
  t.after(() => page.close());
  const rows = page.locator("button.ca-row-open");
  const opener = rows.nth(12);
  await opener.scrollIntoViewIfNeeded();
  const searchBefore = new URL(page.url()).search;
  const beforeScroll = await page.evaluate(() => scrollY);
  for (const exit of [
    () => page.goBack(),
    () => page.getByRole("button", { name: "Back to results" }).click(),
    () => page.keyboard.press("Escape"),
  ]) {
    await opener.focus();
    await opener.press("Enter");
    const heading = page.getByRole("region", { name: "Printed question" }).getByRole("heading");
    await heading.waitFor();
    await page.waitForFunction(() => document.activeElement?.matches(".ca-pane-head h2"));
    assert.ok(await focus(heading), "the pane heading receives focus");
    for (const selector of [".ca-bar input", "button.ca-row-open"]) {
      const blocked = page.locator(selector).first();
      assert.equal(await blocked.evaluate(node => node.closest("[inert]") !== null), true);
      await blocked.evaluate(node => node.focus());
      assert.ok(await focus(heading), "covered controls cannot take focus");
    }
    assert.ok(await page.getByRole("complementary", { name: "Worksheet" }).isVisible());
    await page.keyboard.press("Tab");
    assert.ok(await focus(page.getByRole("button", { name: "Previous question" })));
    await page.getByRole("button", { name: "Next question" }).click();
    assert.notEqual(new URL(page.url()).search, searchBefore);
    await exit();
    await page.waitForURL(url => url.search === searchBefore);
    await page.waitForFunction(() => document.activeElement?.classList.contains("ca-row-open"));
    assert.ok(await focus(opener), "the original row regains focus after stepping");
    assert.equal(await page.evaluate(() => scrollY), beforeScroll);
  }
});

test("phone deep link closes to its filtered results without a preceding list entry", async (t) => {
  const page = await openPage(390, "/?view=detail&unit=u3&topic=3.4&question=mcq-2008-1-29");
  t.after(() => page.close());
  await page.getByRole("region", { name: "Printed question" }).getByRole("heading").waitFor();
  await page.getByRole("button", { name: "Back to results" }).click();
  await page.waitForURL(url => !url.searchParams.has("question") && url.searchParams.get("topic") === "3.4");
  const results = page.getByRole("list", { name: "Results" });
  await results.waitFor();
  await page.waitForFunction(() => document.activeElement?.classList.contains("ca-row-open"));
});

for (const width of [1440, 390]) {
  test(`results use one roving row with a keyboard-accessible add action at ${width}px`, async (t) => {
    const page = await openPage(width);
    t.after(() => page.close());
    const results = page.getByRole("list", { name: "Results" });
    const openButtons = results.locator("button.ca-row-open");
    await openButtons.nth(2).waitFor();
    const filter = page.getByRole("checkbox", { name: "Reviewed print layout only" });
    await filter.focus();
    assert.ok(await focus(filter));
    assert.equal(await results.locator(".ca-row-open[tabindex='0']").count(), 1);
    const search = new URL(page.url()).search;
    await page.keyboard.press("ArrowDown");
    assert.equal(new URL(page.url()).search, search, "arrows outside the list leave selection alone");

    await page.keyboard.press("Tab");
    assert.ok(await focus(openButtons.first()));
    await page.keyboard.press("ArrowDown");
    assert.ok(await focus(openButtons.nth(1)));
    assert.equal(await results.locator(".ca-row-open[tabindex='0']").count(), 1);
    assert.equal(await results.locator(".ca-add[tabindex='0']").count(), 1);
    if (width < 701) assert.equal(new URL(page.url()).search, search, "moving focus does not open the phone pane");
    else assert.equal(await openButtons.nth(1).getAttribute("aria-current"), "true");
    await page.keyboard.press("Tab");
    const add = results.locator(".ca-add").nth(1);
    assert.ok(await focus(add));
    await page.keyboard.press("Space");
    assert.equal(await add.getAttribute("aria-pressed"), "true");
    await page.keyboard.press("ArrowUp");
    assert.ok(await focus(openButtons.first()));
    await page.keyboard.press("ArrowUp");
    assert.ok(await focus(openButtons.first()), "focus stays at the top boundary");
  });
}

test("grouped outline movements stay within their section and preserve unrelated saved positions", async (t) => {
  const [frq1, mcq1, frq2, mcq2, mcq3] = ["frq-2006-3-22", "mcq-2008-2-29", "frq-2005-1-6", "mcq-2018-23-2039", "mcq-2008-1-29"];
  const page = await openPage(1440, "/practice-builder", [frq1, mcq1, frq2, mcq2, mcq3]);
  t.after(() => page.close());
  const outline = page.getByRole("region", { name: "Worksheet outline" });
  const order = region => region.locator("[data-entry-id]").evaluateAll(rows => rows.map(row => row.dataset.entryId));
  const saved = () => page.evaluate(() => {
    const backup = JSON.parse(localStorage.getItem("chematlas-worksheets-v1"));
    return backup.drafts.find(draft => draft.id === backup.active).entries.map(entry => entry.id);
  });
  const mcq = outline.getByRole("region", { name: "Multiple choice" });
  const frq = outline.getByRole("region", { name: "Free response" });
  await mcq.getByRole("button", { name: "Move question 1 down" }).waitFor();
  assert.deepEqual(await order(mcq), [mcq1, mcq2, mcq3]);
  assert.deepEqual(await order(frq), [frq1, frq2]);
  assert.ok(await mcq.getByRole("button", { name: "Move question 1 up" }).isDisabled());
  assert.ok(await mcq.getByRole("button", { name: "Move question 3 down" }).isDisabled());

  await mcq.getByRole("button", { name: "Move question 1 down" }).click();
  assert.deepEqual(await saved(), [frq1, mcq2, frq2, mcq1, mcq3]);
  const moved = mcq.locator(`[data-entry-id="${mcq1}"]`);
  assert.ok(await focus(moved));
  await moved.press("Alt+ArrowUp");
  assert.deepEqual(await saved(), [frq1, mcq1, frq2, mcq2, mcq3]);
  assert.ok(await focus(moved));
  await moved.locator(".ca-b-grip").dragTo(frq.locator("[data-entry-id]").first());
  assert.deepEqual(await saved(), [frq1, mcq1, frq2, mcq2, mcq3]);
  await moved.locator(".ca-b-grip").dragTo(mcq.locator(`[data-entry-id="${mcq3}"]`));
  assert.deepEqual(await saved(), [frq1, mcq3, frq2, mcq2, mcq1]);

  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByLabel("Group by").selectOption("topic");
  const other = outline.getByRole("region", { name: "Needs classification" });
  await other.waitFor();
  assert.deepEqual(await order(other), [mcq2, mcq1]);
  await other.getByRole("button", { name: /Move question \d+ down/ }).first().click();
  assert.deepEqual(await saved(), [frq1, mcq3, frq2, mcq1, mcq2]);

  await page.getByLabel("Group by").selectOption("none");
  await other.waitFor({ state: "detached" });
  assert.deepEqual(await order(outline), await saved());
  await outline.getByRole("button", { name: "Move question 1 down" }).click();
  assert.deepEqual(await saved(), [mcq3, frq1, frq2, mcq1, mcq2]);
});

test("builder tabs retain the layout, picker and PDF toolbar controls", async (t) => {
  const page = await openPage(768, "/practice-builder", ["mcq-2008-1-29", "mcq-2008-2-29", "mcq-2018-23-2039", "frq-2006-3-22"]);
  t.after(() => page.close());
  const tabs = page.getByRole("group", { name: "Builder view" });
  await tabs.getByRole("button", { name: "Layout", exact: true }).click();
  const layout = page.getByRole("region", { name: "Layout" });
  await layout.waitFor();
  for (const label of ["Apply a preset", "Title", "Subtitle", "Worksheet instructions", "Paper size", "Orientation",
    "Group by", "MCQ section heading", "FRQ section heading", "MCQ section instructions", "FRQ section instructions"]) {
    await layout.getByLabel(new RegExp(`^${label}`)).waitFor({ timeout: 4000 });
  }
  assert.equal(await layout.getByRole("slider").count(), 4);
  assert.equal(await layout.getByRole("checkbox").count(), 7);
  await tabs.getByRole("button", { name: "Add questions", exact: true }).click();
  const picker = page.getByRole("region", { name: "Add questions" });
  await picker.getByText("Additional filters", { exact: true }).click();
  for (const label of ["Search", "Unit", "Topic", "Type", "Exam year", "Original source", "Print status", "Practice history", "Auto-add count"]) {
    await picker.getByLabel(new RegExp(`^${label}`)).waitFor({ timeout: 4000 });
  }
  await picker.getByRole("button", { name: "Preview", exact: true }).first().click();
  await picker.getByRole("button", { name: "Close preview", exact: true }).waitFor();

  await tabs.getByRole("button", { name: "Preview", exact: true }).click();
  const toolbar = page.getByRole("group", { name: "PDF preview controls" });
  await toolbar.getByText(/Page 1 of [2-9]\d*/).waitFor();
  assert.ok(await toolbar.getByRole("button", { name: "Previous page" }).isDisabled());
  await toolbar.getByRole("button", { name: "Next page" }).click();
  await toolbar.getByText(/Page 2 of \d+/).waitFor();
  await toolbar.getByRole("button", { name: "Zoom in" }).click();
  assert.ok(await toolbar.getByText("125%", { exact: true }).isVisible());
  await toolbar.getByRole("button", { name: "Fit page" }).click();
  assert.equal(await toolbar.getByRole("button", { name: "Fit page" }).getAttribute("aria-pressed"), "true");
  await toolbar.getByRole("button", { name: "Fit width" }).click();
  assert.ok(await toolbar.getByText("100%", { exact: true }).isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 768);
});

test("phone builder settings collapse into a compact disclosure and keep draft data", async (t) => {
  const page = await openPage(390, "/practice-builder");
  t.after(() => page.close());
  const disclosure = page.getByRole("button", { name: "Worksheet settings" });
  const title = page.getByRole("textbox", { name: "Worksheet title" });
  const header = page.locator(".ca-b-head");
  await disclosure.waitFor();
  assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
  assert.equal(await title.count(), 0);
  assert.ok((await header.boundingBox()).height <= 65);
  await disclosure.click();
  await title.fill("Saved phone worksheet");
  await page.getByRole("combobox", { name: "Saved worksheets" }).waitFor();
  await page.getByRole("button", { name: "New worksheet" }).waitFor();
  await page.getByText("Drafts", { exact: true }).waitFor();
  await disclosure.click();
  assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
  await page.reload();
  await disclosure.click();
  assert.equal(await title.inputValue(), "Saved phone worksheet");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.setViewportSize({ width: 768, height: 900 });
  await disclosure.waitFor({ state: "hidden" });
  await title.waitFor();
});

test("the last real worksheet preview remains visible during an update and a failed request", async (t) => {
  const page = await openPage(1440, "/practice-builder", ["mcq-2008-1-29", "mcq-2008-2-29", "mcq-2018-23-2039"]);
  t.after(() => page.close());
  const download = page.getByRole("link", { name: "Download PDF" });
  await download.waitFor();
  const originalUrl = await download.getAttribute("href");
  const canvas = page.locator(".worksheet-preview canvas");
  await page.waitForFunction(() => document.querySelector(".worksheet-preview canvas")?.width > 300);
  const original = await canvas.evaluate(node => node.toDataURL());
  let releaseRequest;
  const blockedRequest = new Promise(resolve => { releaseRequest = resolve; });
  try {
    await page.route(`${origin.origin}/worksheet-fragments.pdf`, async route => {
      await blockedRequest;
      await route.fulfill({ status: 503, body: "preview test failure" });
    }, { times: 1 });
    const request = page.waitForRequest(`${origin.origin}/worksheet-fragments.pdf`);
    await page.getByRole("button", { name: "Move question 1 down", exact: true }).click();
    await request;
    await page.getByText("Updating…", { exact: true }).waitFor();
    assert.equal(await canvas.evaluate(node => node.toDataURL()), original);
    assert.ok(await page.locator(".ca-b-pdf-display[data-stale]").isVisible());
    assert.equal(await download.count(), 0);
    assert.ok(await page.getByRole("button", { name: "Download PDF", exact: true }).isDisabled());
    assert.ok(await page.getByRole("button", { name: "Open PDF to print", exact: true }).isDisabled());
    releaseRequest();
    const retry = page.getByRole("button", { name: "Retry preview" });
    await retry.waitFor();
    assert.match(await page.getByRole("alert").innerText(), /last successful PDF/);
    assert.equal(await canvas.evaluate(node => node.toDataURL()), original);
    await retry.click();
    await download.waitFor();
    assert.notEqual(await download.getAttribute("href"), originalUrl);
    assert.equal(await page.locator(".ca-b-pdf-display[data-stale]").count(), 0);
  } finally {
    releaseRequest();
  }
});

test("the unit palette and selected phone topic have legible colours in the browser", async (t) => {
  const page = await openPage(390, "/?view=library&unit=u3&topic=3.4");
  t.after(() => page.close());
  await page.getByRole("button", { name: "3.4", exact: true }).click();
  const active = page.getByRole("dialog", { name: "Topics" }).getByRole("button", { name: /3.4 Ideal Gas Law/ });
  const colors = await active.evaluate(button => {
    const ctx = document.createElement("canvas").getContext("2d");
    const luminance = color => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const linear = value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      };
      return .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
    };
    const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const units = Array.from(document.querySelectorAll(".ca-unit[data-u]"), node => {
      const style = getComputedStyle(node);
      const deep = luminance(style.getPropertyValue("--deep"));
      const tint = luminance(style.getPropertyValue("--tint"));
      return [ratio(deep, tint), ratio(1, deep), ratio(deep, 1)];
    });
    const topic = ratio(luminance(getComputedStyle(button.querySelector(".ca-code")).color), luminance(getComputedStyle(button).backgroundColor));
    return { units, topic };
  });
  assert.equal(colors.units.length, 9);
  const lowest = Math.min(...colors.units.flat());
  assert.ok(lowest >= 4.5);
  assert.ok(colors.topic >= 4.5);
  t.diagnostic(`Lowest unit token pair ${lowest.toFixed(2)}:1. Selected topic code ${colors.topic.toFixed(2)}:1.`);
});
