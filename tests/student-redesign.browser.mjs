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

async function openPage(width, path = "/", seedIds = [], prepare) {
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
  await prepare?.(page);
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
  await page.getByRole("region", { name: "Printed question" }).getByRole("heading", { name: /2008 · Question 1/ }).waitFor();
  await page.getByRole("button", { name: "Back to results" }).click();
  await page.waitForURL(url => !url.searchParams.has("question") && url.searchParams.get("topic") === "3.4");
  const results = page.getByRole("list", { name: "Results" });
  await results.waitFor();
  await page.waitForFunction(() => document.activeElement?.classList.contains("ca-row-open"));
});

test("phone deep link has a focusable return path while the catalog is loading", async (t) => {
  let releaseCatalog;
  const catalog = new Promise(resolve => { releaseCatalog = resolve; });
  t.after(releaseCatalog);
  const page = await openPage(390, "/?view=detail&unit=u3&topic=3.4&question=mcq-2008-1-29", [], async page => {
    await page.route(`${origin.origin}/student-questions.json`, async route => {
      await catalog;
      await route.fallback();
    });
  });
  t.after(() => page.close());
  await page.getByRole("heading", { name: "Loading the catalog…" }).waitFor();
  await page.getByRole("button", { name: "Back to results" }).click();
  await page.waitForURL(url => !url.searchParams.has("question"));
  await page.waitForFunction(() => document.activeElement?.matches(".ca-list-title h1"));
  releaseCatalog();
  await page.locator("button.ca-row-open").first().waitFor();
  assert.ok(await focus(page.locator(".ca-list-title h1")), "loading results do not steal the returned focus");
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

test("arrow-focused phone results stay above the worksheet strip and below the course band", async (t) => {
  const page = await openPage(390);
  t.after(() => page.close());
  await page.locator("button.ca-row-open").first().focus();
  const assertVisibleFocus = async () => {
    assert.ok(await page.evaluate(() => {
      const target = document.activeElement;
      const row = target.getBoundingClientRect();
      return target.matches(".ca-row-open") &&
        row.top >= document.querySelector(".ca-course").getBoundingClientRect().bottom - 1 &&
        row.bottom <= document.querySelector(".ca-dock").getBoundingClientRect().top + 1;
    }));
  };
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press("ArrowDown");
    await assertVisibleFocus();
  }
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press("ArrowUp");
    await assertVisibleFocus();
  }
});

test("desktop Next and Previous keep focus in the question controls", async (t) => {
  const page = await openPage(1440, "/?view=detail&question=mcq-2008-1-29&unit=u1");
  t.after(() => page.close());
  const start = new URL(page.url()).searchParams.get("question");
  const next = page.getByRole("button", { name: "Next question", exact: true });
  await next.press("Enter");
  await page.waitForURL(url => url.searchParams.get("question") !== start);
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Next question");
  const previous = page.getByRole("button", { name: "Previous question", exact: true });
  await previous.press("Enter");
  await page.waitForURL(url => url.searchParams.get("question") === start);
  await page.waitForFunction(() => document.activeElement?.matches(".ca-pane-head h2, button[aria-label='Previous question']"));
});

test("Question Bank shortcuts affect the focused feature and leave other controls alone", async (t) => {
  const page = await openPage(1440, "/?view=detail&question=mcq-2008-1-29&unit=u1");
  t.after(() => page.close());
  const more = page.getByRole("button", { name: "More", exact: true });
  const dock = page.getByRole("complementary", { name: "Worksheet" });
  const added = dock.getByRole("button", { name: /^Worksheet question/ });
  const crop = page.getByRole("button", { name: "Question crop", exact: true });
  await crop.waitFor();
  await more.focus();
  await page.keyboard.press("a");
  await page.keyboard.press("f");
  assert.equal(await added.count(), 0);
  assert.equal(await crop.getAttribute("aria-pressed"), "false");

  await page.locator('li[data-id="mcq-2008-1-29"] button.ca-row-open').focus();
  await page.keyboard.press("a");
  await added.waitFor();
  await page.keyboard.press("f");
  assert.equal(await crop.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("/");
  assert.ok(await focus(page.getByRole("searchbox", { name: "Search questions" })));
});

test("More uses normal Tab order and returns focus when closed with Escape or a destination", async (t) => {
  const page = await openPage(1440);
  t.after(() => page.close());
  await page.locator("button.ca-row-open").first().waitFor();
  const more = page.getByRole("button", { name: "More", exact: true });
  const sessions = page.getByRole("button", { name: "Practice sessions", exact: true });
  const progress = page.getByRole("button", { name: "Progress", exact: true });

  await more.press("Enter");
  await sessions.waitFor();
  assert.equal(await more.getAttribute("aria-expanded"), "true");
  assert.ok(await focus(more));
  await page.keyboard.press("Tab");
  assert.ok(await focus(sessions));
  await page.keyboard.press("Tab");
  assert.ok(await focus(progress));
  await page.keyboard.press("Escape");
  await sessions.waitFor({ state: "hidden" });
  assert.ok(await focus(more));

  await more.press("Space");
  await sessions.waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForURL(url => url.searchParams.get("view") === "progress");
  await progress.waitFor({ state: "hidden" });
  assert.ok(await focus(more));

  await more.press("Enter");
  await sessions.waitFor();
  await page.getByRole("link", { name: /Practice builder/ }).focus();
  await sessions.waitFor({ state: "hidden" });
  assert.equal(await more.getAttribute("aria-expanded"), "false");

  await page.setViewportSize({ width: 320, height: 600 });
  await more.press("Enter");
  await sessions.waitFor();
  assert.ok(await page.locator(".ca-menu").evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth;
  }));
});

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
  const title = page.getByRole("textbox", { name: "Worksheet title" });
  await title.fill("Renamed after reordering");
  await outline.getByRole("button", { name: "Undo", exact: true }).click();
  assert.deepEqual(await saved(), [frq1, mcq3, frq2, mcq1, mcq2]);
  assert.equal(await title.inputValue(), "Renamed after reordering");
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
  await page.waitForFunction(() => {
    const paper = document.querySelector('.worksheet-paper[data-fit-page="true"]');
    const canvas = paper?.querySelector("canvas[data-painted]");
    return canvas && canvas.clientHeight <= paper.clientHeight + 1 && canvas.clientWidth <= paper.clientWidth + 1;
  });
  await toolbar.getByRole("button", { name: "Fit width" }).click();
  assert.ok(await toolbar.getByText("100%", { exact: true }).isVisible());
  const buttonRows = await toolbar.getByRole("button").evaluateAll(buttons => new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size);
  assert.equal(buttonRows, 1, "the tablet toolbar fits on one row");
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

test("an unbroken worksheet section heading wraps within a 320px phone", async (t) => {
  const page = await openPage(320, "/practice-builder", ["mcq-2008-1-29"]);
  t.after(() => page.close());
  const sectionName = "W".repeat(80);
  await page.getByRole("button", { name: "Layout", exact: true }).click();
  await page.getByLabel("MCQ section heading").fill(sectionName);
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const heading = page.getByRole("heading", { name: sectionName, exact: true });
  await heading.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  assert.ok(await heading.evaluate(el => el.scrollWidth <= el.clientWidth));
});

test("tablet Fit page and Zoom out use a stable, bounded worksheet preview", async (t) => {
  const page = await openPage(768, "/practice-builder", ["mcq-2008-1-29", "frq-2006-3-22"]);
  t.after(() => page.close());
  await page.setViewportSize({ width: 768, height: 700 });
  const paper = page.getByRole("region", { name: "Worksheet PDF" });
  const canvas = paper.locator("canvas");
  const visibleHeight = () => paper.evaluate(el => Math.min(el.clientHeight,
    el.closest(".ca-b-side").getBoundingClientRect().bottom - el.getBoundingClientRect().top));
  await page.waitForFunction(() => {
    const panel = document.querySelector(".worksheet-paper");
    const canvas = panel?.querySelector("canvas[data-painted]");
    return canvas?.style.width && canvas.clientHeight >
      panel.closest(".ca-b-side").getBoundingClientRect().bottom - panel.getBoundingClientRect().top;
  });
  const widthFit = await canvas.boundingBox();
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.waitForFunction(width => {
    const canvas = document.querySelector(".worksheet-paper canvas[data-painted]");
    return canvas?.clientWidth < width - 2;
  }, widthFit.width, { timeout: 7000 });
  const pageFit = await canvas.boundingBox();
  const availableHeight = await visibleHeight();
  assert.ok(pageFit.height <= availableHeight + 2);

  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.waitForFunction(height => document.querySelector(".worksheet-paper canvas[data-painted]")?.clientHeight < height - 2, pageFit.height);
  const zoomed = await canvas.boundingBox();
  assert.ok(Math.abs(zoomed.height - pageFit.height * .75) <= 2, `expected 75% of ${pageFit.height}px, got ${zoomed.height}px`);
  assert.ok(Math.abs(await visibleHeight() - availableHeight) <= 1, "the measurement area stays the same when the canvas zooms");
});

test("the last real worksheet preview remains visible during an update and a failed request", async (t) => {
  const page = await openPage(1440, "/practice-builder", ["mcq-2008-1-29", "mcq-2008-2-29", "mcq-2018-23-2039", "mcq-2008-42-39"]);
  t.after(() => page.close());
  const download = page.getByRole("link", { name: "Download PDF" });
  await download.waitFor();
  const originalUrl = await download.getAttribute("href");
  await page.getByText(/questions have no reviewed print layout/).waitFor();
  const canvas = page.locator(".worksheet-preview canvas[data-painted]");
  await canvas.waitFor();
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

async function waitForQuestionCanvases(page, count) {
  await page.waitForFunction(expected => {
    const canvases = [...document.querySelectorAll(".ca-viewport canvas")];
    return canvases.length === expected && canvases.every(canvas => canvas.style.visibility === "visible" && canvas.height > 0);
  }, count);
}

test("the Question Bank viewer is reachable and scrollable on short landscape screens", async (t) => {
  const page = await openPage(844, "/?view=detail&question=frq-2005-2-7&unit=u1&topic=1.3");
  t.after(() => page.close());
  await page.setViewportSize({ width: 844, height: 390 });
  await waitForQuestionCanvases(page, 1);
  const viewport = page.locator(".ca-viewport");
  await viewport.scrollIntoViewIfNeeded();
  const geometry = await viewport.evaluate(el => {
    const bank = el.closest(".ca-bank");
    const rect = el.getBoundingClientRect();
    const x = (rect.left + rect.right) / 2;
    const y = (Math.max(rect.top, 0) + Math.min(rect.bottom, innerHeight)) / 2;
    return { bankScroll: bank.scrollTop, hit: el.contains(document.elementFromPoint(x, y)),
      scrollable: el.scrollHeight > el.clientHeight };
  });
  assert.equal(geometry.bankScroll, 0, "the viewer is reachable without scrolling a clipped bank container");
  assert.ok(geometry.hit);
  assert.ok(geometry.scrollable);
  await viewport.hover();
  await page.mouse.wheel(0, 160);
  await page.waitForFunction(() => document.querySelector(".ca-viewport")?.scrollTop > 0);
});

test("the phone question pane reserves space for empty and populated worksheet strips", async (t) => {
  const page = await openPage(390, "/?view=detail&question=frq-2005-2-7&unit=u1&topic=1.3");
  t.after(() => page.close());
  await page.setViewportSize({ width: 390, height: 600 });
  await waitForQuestionCanvases(page, 1);
  const assertClearPane = () => page.waitForFunction(() => {
    const pane = document.querySelector(".ca-pane").getBoundingClientRect();
    const strip = document.querySelector(".ca-dock").getBoundingClientRect();
    return Math.abs(pane.bottom - strip.top) <= 1;
  }, undefined, { timeout: 4500 });
  await assertClearPane();
  await page.getByRole("button", { name: "Add to worksheet", exact: true }).click();
  await page.locator(".ca-dock li").first().waitFor();
  await assertClearPane();
});

test("phone fit-width rendering settles and ignores height-only changes", async (t) => {
  const page = await openPage(390, "/?view=detail&question=frq-2005-2-7&unit=u1&topic=1.3");
  t.after(() => page.close());
  await waitForQuestionCanvases(page, 1);
  const result = await page.locator(".ca-viewport").evaluate(async viewport => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    let loading = false;
    const observer = new MutationObserver(records => {
      loading ||= records.some(record => Array.from(record.addedNodes).some(node =>
        node instanceof HTMLElement && node.matches(".pdf-wait")));
    });
    observer.observe(viewport, { childList: true, subtree: true });
    const observeFrames = () => new Promise(resolve => {
      let frames = 0;
      function tick() {
        if (++frames === 12) resolve();
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    await observeFrames();
    const settled = !loading && !viewport.querySelector(".pdf-wait");
    loading = false;
    viewport.style.flex = "none";
    viewport.style.height = `${height + 40}px`;
    await observeFrames();
    observer.disconnect();
    return { settled, loading: loading || !!viewport.querySelector(".pdf-wait"), width, height,
      changedWidth: viewport.clientWidth, changedHeight: viewport.clientHeight };
  });
  assert.ok(result.settled, "the loading message stays gone once the source has rendered");
  assert.equal(result.changedWidth, result.width);
  assert.notEqual(result.changedHeight, result.height);
  assert.equal(result.loading, false, "height-only changes do not restart a width-fitted render");
  const before = await page.locator(".ca-viewport canvas").evaluate(canvas => parseFloat(canvas.style.width));
  await page.setViewportSize({ width: 430, height: 844 });
  await page.waitForFunction(width => parseFloat(document.querySelector(".ca-viewport canvas")?.style.width) > width, before);
});

test("shared-stimulus crops and multipage FRQs fit and draw in the phone pane", async (t) => {
  const page = await openPage(390, "/?view=detail&question=mcq-2008-1-29");
  t.after(() => page.close());
  await waitForQuestionCanvases(page, 1);
  await page.getByText(/Check the worksheet PDF for the final layout/).waitFor();
  await page.getByRole("button", { name: "Question crop", exact: true }).click();
  await page.getByText("Shared with neighbouring questions", { exact: true }).waitFor();
  await waitForQuestionCanvases(page, 2);
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.waitForFunction(() => {
    const frame = document.querySelector(".ca-viewport");
    return frame?.clientHeight > 300 && frame.scrollHeight <= frame.clientHeight + 4;
  });

  await page.goto(new URL("/?view=detail&question=frq-2005-3-8&unit=u5&topic=5.2", origin).href);
  await waitForQuestionCanvases(page, 1);
  await page.getByRole("button", { name: "Page 9", exact: true }).click();
  await waitForQuestionCanvases(page, 1);
  assert.match(await page.locator(".ca-viewport canvas").getAttribute("aria-label"), /page 9$/);
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".ca-viewport")?.clientHeight > 300);
  await waitForQuestionCanvases(page, 1);
});

test("a manually indexed PDF bank question still opens after reload", async (t) => {
  const page = await openPage(768, "/?view=banks");
  t.after(() => page.close());
  const { PDFDocument } = require("pdf-lib");
  const document = await PDFDocument.create();
  document.addPage().drawText("Temporary student bank test");
  const name = "temporary-bank.pdf";
  await page.locator("input[type=file]").setInputFiles({
    name, mimeType: "application/pdf", buffer: Buffer.from(await document.save()),
  });
  await page.getByText(/temporary-bank.pdf is saved/).waitFor();
  await page.getByLabel("PDF page").fill("1");
  await page.getByLabel("Question #").fill("47");
  await page.getByLabel("Primary topic").selectOption("1.1");
  await page.getByRole("button", { name: /Add source question/ }).click();
  await page.getByText(/Question added. Progress/).waitFor();
  const id = await page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem("apchem-studio-v2"));
    return progress.questions.find(question => question.number === 47 && question.source === "temporary-bank.pdf")?.id;
  });
  assert.ok(id);
  await page.goto(new URL(`/?view=detail&question=${encodeURIComponent(id)}`, origin).href);
  await waitForQuestionCanvases(page, 1);
  assert.equal(await page.locator(".ca-viewport canvas").getAttribute("aria-label"), `${name}, page 1`);
});
