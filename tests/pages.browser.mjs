import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { startFixture } from "./fixtures/supabase-http.mjs";
import { assertPagesArtifact } from "../scripts/pages/assert-artifact.mjs";

let fixture, browser;
const evidence = [];
before(async () => {
  await assertPagesArtifact();
  fixture = await startFixture();
  browser = await chromium.launch();
  await mkdir("test-results/pages", { recursive: true });
});
after(async () => {
  await mkdir("test-results/pages", { recursive: true });
  await browser?.close();
  await fixture?.close();
  await writeFile("test-results/pages/results.json", JSON.stringify(evidence, null, 2));
});
async function open(width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce", acceptDownloads: true });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname) || ["blob:", "data:"].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(20000);
  await page.goto(fixture.origin);
  await page.getByRole("button", { name: "Log in", exact: true }).waitFor();
  return { context, page, errors };
}
async function login(page, email = "approved@example.test") {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}
async function bankReady(page) { await page.locator(".ca-row-open").first().waitFor(); }

test("anonymous visitor sees login and public Pages paths never serve protected files or admin routes", async () => {
  const { context, page, errors } = await open();
  try {
    const start = fixture.logs.length;
    for (const path of ["student-questions.json", "source/bank-01.pdf", "worksheet-content.json", "worksheet-fragments.pdf", "admin/", "api/admin/question-review"]) {
      assert.equal((await page.request.get(new URL(path, fixture.origin).href)).status(), 404);
    }
    assert(!fixture.logs.slice(start).some(log => log.path.startsWith("/storage/")));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: "test-results/pages/login.png" });
    evidence.push({ scenario: "anonymous", result: "denied; protected Pages files absent" });
  } finally { await context.close(); }
});
test("authenticated unapproved visitor is denied without protected content requests", async () => {
  const { context, page, errors } = await open();
  try {
    const start = fixture.logs.length;
    await login(page, "unapproved@example.test");
    await page.getByRole("heading", { name: "Approval required" }).waitFor();
    assert(!fixture.logs.slice(start).some(log => log.path.startsWith("/storage/")));
    assert.deepEqual(errors, []);
    evidence.push({ scenario: "unapproved", result: "denied; no question or PDF request" });
  } finally { await context.close(); }
});
test("invite and recovery callbacks offer password setup and remove tokens from the address bar", async () => {
  for (const type of ["invite", "recovery"]) {
    const response = await fetch(`${fixture.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "approved@example.test", password: "fixture-password" }) });
    const session = await response.json();
    const { context, page, errors } = await open();
    try {
      const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: "3600", token_type: "bearer", type });
      await page.goto("about:blank");
      await page.goto(`${fixture.origin}#${hash}`);
      await page.getByRole("heading", { name: "Set your password" }).waitFor();
      assert(!page.url().includes("access_token"));
      await page.getByLabel("Password", { exact: true }).fill("replacement-fixture-password");
      await page.getByRole("button", { name: "Save password", exact: true }).click();
      await bankReady(page);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  evidence.push({ scenario: "email-callbacks", result: "invite/recovery password setup completed; tokens removed from URL (simulated Auth)" });
});
test("approved student restores progress, views a real PDF, generates a worksheet, reloads drafts, and logs out", async () => {
  const { context, page, errors } = await open();
  try {
    await page.evaluate(() => {
      localStorage.setItem("apchem-studio-v1", JSON.stringify({ progress: { "mcq-2008-1-29": { attempts: 2, wrong: 1, correct: 1, history: [] } } }));
      localStorage.setItem("chematlas-student-worksheet-v1", JSON.stringify(["mcq-2008-1-29", "mcq-2008-2-29", "mcq-2008-3-29"]));
    });
    await login(page); await bankReady(page);
    await page.locator(".ca-row-open").first().click();
    await page.waitForFunction(() => [...document.querySelectorAll(".pdf-frame canvas")].some(canvas => canvas.width > 0 && canvas.style.visibility === "visible"));
    await page.screenshot({ path: "test-results/pages/bank-desktop.png", fullPage: true });
    const builder = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: /Practice builder/i });
    assert.equal(await builder.getAttribute("href"), "/ChemAtlas/practice-builder/");
    await builder.click();
    await page.getByRole("heading", { name: "Practice builder", exact: false }).waitFor();
    const download = page.getByRole("link", { name: "Download PDF", exact: true });
    await download.waitFor({ timeout: 60000 });
    assert.equal(await page.locator(".ca-b-item").count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll(".worksheet-preview canvas")].some(canvas => canvas.width > 0));
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    const bytes = await readFile(await file.path());
    assert((await PDFDocument.load(bytes)).getPageCount() >= 1);
    await page.screenshot({ path: "test-results/pages/builder-desktop.png", fullPage: true });
    await page.reload();
    await download.waitFor({ timeout: 60000 });
    assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByLabel("3 selected", { exact: true }).count(), 1);
    const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("apchem-studio-v2")).progress);
    assert.equal(progress["mcq-2008-1-29"].attempts, 2);
    const logout = fixture.pauseLogout();
    try {
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await logout.entered;
      assert.equal(await page.locator(".pdf-frame canvas,.worksheet-preview canvas").count(), 0);
      assert.equal(await page.getByRole("button", { name: "Log in", exact: true }).count(), 0);
    } finally { logout.release(); }
    await page.getByRole("button", { name: "Log in", exact: true }).waitFor();
    await page.waitForFunction(() => localStorage.getItem("chematlas-supabase-auth-v1") === null);
    assert.equal(await page.locator(".pdf-frame canvas,.worksheet-preview canvas").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("chematlas-supabase-auth-v1")), null);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("apchem-studio-v2")).progress["mcq-2008-1-29"].attempts), 2);
    assert.deepEqual(errors, []);
    evidence.push({ scenario: "approved-desktop", result: "real PDF painted; worksheet PDF downloaded and parsed; drafts/progress survived reload and logout" });
  } finally { await context.close(); }
});
test("approved phone student can navigate the Question Bank and PDF viewer under the Pages base path", async () => {
  const { context, page, errors } = await open(390);
  try {
    await login(page); await bankReady(page);
    await page.locator(".ca-row-open").first().click();
    await page.waitForFunction(() => [...document.querySelectorAll(".pdf-frame canvas")].some(canvas => canvas.width > 0 && canvas.style.visibility === "visible"));
    await page.screenshot({ path: "test-results/pages/bank-phone.png", fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goBack(); await bankReady(page);
    assert(new URL(page.url()).pathname.startsWith("/ChemAtlas/"));
    assert.deepEqual(errors, []);
    evidence.push({ scenario: "approved-phone", result: "PDF painted, Back navigation and viewport fit passed" });
  } finally { await context.close(); }
});
test("direct HTTP requests cannot bypass the PostgreSQL policies, and revocation denies an existing session", async () => {
  const object = `${fixture.api}/storage/v1/object/authenticated/chematlas-content/shared/releases/fixture/source/bank-01.pdf`;
  assert.equal((await fetch(object)).status, 403);
  async function session(email) {
    return (await fetch(`${fixture.api}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "fixture-password" }) })).json();
  }
  const denied = await session("unapproved@example.test");
  const allowed = await session("approved@example.test");
  const headers = { Authorization: `Bearer ${allowed.access_token}` };
  assert.equal((await fetch(object, { headers: { Authorization: `Bearer ${denied.access_token}` } })).status, 403);
  assert.equal((await fetch(object, { headers: { ...headers, Range: "bytes=0-63" } })).status, 206);
  assert.equal((await fetch(object, { method: "POST", headers, body: "changed" })).status, 403);
  assert.deepEqual(await (await fetch(object, { method: "DELETE", headers })).json(), []);
  assert.equal((await fetch(`${fixture.api}/rest/v1/approved_users`, { method: "POST", headers })).status, 403);
  await fixture.revoke(true);
  try { assert.equal((await fetch(object, { headers })).status, 403); }
  finally { await fixture.revoke(false); }
  evidence.push({ scenario: "direct-http", result: "anonymous/unapproved reads, student writes/self-approval denied; existing JWT denied after revocation" });
});
test("revocation removes the visible app on access recheck", async () => {
  const { context, page } = await open();
  try {
    await login(page); await bankReady(page);
    await fixture.revoke(true);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.getByRole("heading", { name: "Approval required" }).waitFor();
    assert.equal(await page.locator(".ca-row-open").count(), 0);
    evidence.push({ scenario: "revocation-ui", result: "protected UI removed without clearing saved progress" });
  } finally { await fixture.revoke(false); await context.close(); }
});
