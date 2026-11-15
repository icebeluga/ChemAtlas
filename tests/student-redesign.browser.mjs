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

async function openPage(width, path = "/") {
  const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: "reduce" });
  const token = process.env.CHEMATLAS_TEST_ACCESS_TOKEN;
  if (token) {
    await page.route(`${origin.origin}/**`, route => route.continue({
      headers: { ...route.request().headers(), "cf-access-jwt-assertion": token },
    }));
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
  const rows = page.locator(".ca-row-open");
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
    for (const selector of [".ca-bar input", ".ca-row-open"]) {
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
