import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { parseProgress, serializeProgress } from "../lib/progress-transfer.mjs";
import { startFixture } from "./fixtures/supabase-http.mjs";
import { assertPagesArtifact } from "../scripts/pages/assert-artifact.mjs";

let fixture, browser;
const evidence = [];
before(async () => {
  const artifactDirectory = process.env.CHEMATLAS_PAGES_TEST_DIR ?? "dist-pages";
  await assertPagesArtifact(artifactDirectory);
  fixture = await startFixture({ artifactDirectory });
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

test("a failed student application download shows recovery and reload preserves the signed-in session", async () => {
  const { context, page } = await open();
  const chunk = "**/assets/student-app-*.js";
  try {
    await context.route(chunk, route => route.abort());
    await login(page);
    await page.getByRole("heading", { name: "ChemAtlas could not open", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Log out", exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => !!localStorage.getItem("chematlas-supabase-auth-v1")), true);
    const signIns = fixture.logs.filter(log => log.path === "/auth/v1/token").length;
    await context.unroute(chunk);
    await page.getByRole("button", { name: "Reload ChemAtlas", exact: true }).click();
    await bankReady(page);
    assert.equal(fixture.logs.filter(log => log.path === "/auth/v1/token").length, signIns);
    evidence.push({ scenario: "application-load-recovery", result: "failed application download shows recovery; reload restores the bank without another sign-in" });
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
    await file.saveAs("test-results/pages/worksheet.pdf");
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
test("progress export and confirmed import round trip without native browser dialogs or changes to worksheets", async () => {
  const { context, page, errors } = await open();
  try {
    const id = "mcq-2008-1-29";
    await page.evaluate(id => localStorage.setItem("apchem-studio-v2", JSON.stringify({
      progress: { [id]: { attempts: 2, wrong: 1, correct: 1, last: "2026-11-18", history: [] } },
      overrides: {}, sessions: 2, banks: [], questions: [],
    })), id);
    await login(page); await bankReady(page);
    await page.locator(".ca-add").nth(0).click();
    await page.locator(".ca-add").nth(1).click();
    await page.getByRole("link", { name: "Progress", exact: true }).click();
    await page.getByRole("heading", { name: "Progress & patterns", exact: true }).waitFor();
    const snapshot = () => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("apchem-studio-v2"));
      return { progress: saved.progress, overrides: saved.overrides, sessions: saved.sessions };
    });
    const before = await snapshot();
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export progress (.json)", exact: true }).click()]);
    const exported = await readFile(await file.path(), "utf8");
    assert.deepEqual(JSON.parse(JSON.stringify(parseProgress(exported))), before);
    assert(!/access_token|refresh_token|textPreview|sourceRegions/.test(exported));
    const imported = { ...before, progress: { [id]: { ...before.progress[id], attempts: 9, wrong: 8 } }, overrides: { [id]: "3.4" }, sessions: 12 };
    const input = page.locator('input[type="file"][accept=".json,application/json"]');
    const upload = { name: "progress-rehearsal.json", mimeType: "application/json", buffer: Buffer.from(serializeProgress(imported)) };
    const confirmation = page.getByRole("alertdialog", { name: "Replace saved progress?", exact: true });
    await input.setInputFiles(upload);
    await confirmation.waitFor();
    assert.deepEqual(await snapshot(), before);
    await page.waitForFunction(() => document.activeElement?.textContent === "Cancel");
    await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    assert.deepEqual(await snapshot(), before);
    // Native dialog close events can follow the hidden state on Linux Chromium.
    await page.waitForFunction(() => document.activeElement?.textContent === "Import progress (.json)");
    await input.setInputFiles(upload); await confirmation.waitFor();
    await page.keyboard.press("Escape"); await confirmation.waitFor({ state: "hidden" });
    assert.deepEqual(await snapshot(), before);
    await input.setInputFiles(upload); await confirmation.waitFor();
    await confirmation.getByRole("button", { name: "Replace progress", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Progress imported." }).waitFor();
    assert.deepEqual(await snapshot(), imported);
    await page.reload();
    await page.getByRole("heading", { name: "Progress & patterns", exact: true }).waitFor();
    assert.deepEqual(await snapshot(), imported);
    await page.getByRole("navigation", { name: "Main navigation" }).getByLabel("2 selected", { exact: true }).waitFor();
    await input.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"format":"unsupported"}') });
    await page.getByRole("status").filter({ hasText: "Unsupported ChemAtlas progress export format or version." }).waitFor();
    assert.deepEqual(await snapshot(), imported);
    assert.equal(await confirmation.isVisible(), false);
    assert.deepEqual(errors, []);
    evidence.push({ scenario: "progress-transfer", result: "real export validated; cancel/Escape preserve state; explicit confirmation imports attempts/overrides/sessions, survives reload and retains worksheets; invalid import denied" });
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

test("the supplied login identity, password visibility and ChemAtlas tab identity work on desktop and phone", async () => {
  const {context,page,errors}=await open();
  try {
    assert.equal(await page.title(),"ChemAtlas");
    const icon=await page.locator('link[rel="icon"]').getAttribute("href");
    assert.equal(icon,"/ChemAtlas/favicon.png");
    assert.deepEqual(await (await page.request.get(new URL(icon,fixture.origin).href)).body(),await readFile("public/favicon.png"));
    await page.getByRole("heading",{name:"Welcome back",exact:true}).waitFor();
    assert.equal(await page.locator(".ca-auth-header").innerText(), "ChemAtlas\nStudent access");
    assert.equal(await page.locator(".ca-auth-subtitle").count(), 0);
    const password=page.getByLabel("Password",{exact:true});
    await password.fill("fixture-password");
    await page.getByRole("button",{name:"Show password",exact:true}).click();
    assert.equal(await password.getAttribute("type"),"text");
    await page.getByRole("button",{name:"Hide password",exact:true}).click();
    assert.equal(await password.getAttribute("type"),"password");
    await page.setViewportSize({width:320,height:600});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await password.fill("");
    await page.screenshot({path:"test-results/pages/login-phone.png"});
    await login(page);
    await bankReady(page);
    assert.equal(await page.locator(".ca-auth-session,.ca-more,.ca-menu").count(),0);
    const signOut=page.getByRole("button",{name:"Log out",exact:true});
    await signOut.focus();
    await signOut.press("Enter");
    await page.getByRole("heading",{name:"Welcome back",exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"login-reference",result:"supplied favicon bytes; ChemAtlas title; password visibility; 320px keyboard sign-out"});
  }finally{await context.close()}
});

test("compact units and two intrinsic-width topic rows keep the document fitted and the PDF scrollable", async () => {
  const {context,page,errors}=await open();
  try {
    await login(page);await bankReady(page);
    for (const width of [1440,1280]) {
    await page.setViewportSize({width,height:900});
    for(let unit=1;unit<=9;unit++){
      await page.getByRole("button",{name:new RegExp("^Unit "+unit+",")}).click();
      assert.equal(await page.locator(".ca-unit[data-u]>span").count(),1);
      await page.waitForFunction(() => [...document.querySelectorAll(".ca-topic-row")].filter(row=>row.children.length).every(row=>
        Math.abs(row.lastElementChild.getBoundingClientRect().right-row.getBoundingClientRect().right)<=1));
      const geometry=await page.locator(".ca-topic-row").evaluateAll(rows=>rows.filter(row=>row.children.length).map(row=>{
        const r=row.getBoundingClientRect(),buttons=[...row.querySelectorAll(".ca-topic")];
        return {left:r.left,right:r.right,top:r.top,first:buttons[0].getBoundingClientRect().left,last:buttons.at(-1).getBoundingClientRect().right,
          widths:buttons.map(b=>b.getBoundingClientRect().width),
          overflow:buttons.some(b=>b.scrollWidth>b.clientWidth+1),
          lines:buttons.map(b=>{const name=b.querySelector(".ca-topic-name");return name.clientHeight/parseFloat(getComputedStyle(name).lineHeight)})};
      }));
      assert.ok(geometry.length<=2);
      for(const row of geometry){
        assert.ok(Math.abs(row.first-row.left)<=1&&Math.abs(row.last-row.right)<=1);
        assert.ok(row.right<=width&&row.left>=0);
        assert.equal(row.overflow,false);
        assert.ok(Math.max(...row.lines)<=2.1,"topic labels stay within two lines: "+JSON.stringify({unit,width,row}));
      }
      if([1,2,8].includes(unit)){
        const widths=geometry.flatMap(row=>row.widths);
        assert.ok(Math.max(...widths)-Math.min(...widths)>20,"topic widths stay variable");
        await page.locator(".ca-course").screenshot({path:"test-results/pages/topics-u"+unit+"-"+width+".png"});
      }
    }
    }
    for(const [width,height] of [[1440,900],[768,700],[844,390],[390,844],[320,600]]){
      await page.setViewportSize({width,height});
      await page.waitForFunction(()=>document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1);
      const list=page.locator(".ca-rows");
      await list.evaluate(el=>el.scrollTop=el.scrollHeight);
      assert.ok(await list.evaluate(el=>el.scrollHeight<=el.clientHeight || el.scrollTop>0));
      assert.equal(await page.evaluate(()=>scrollY),0);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator(".ca-row-open").first().click();
    await page.waitForFunction(()=>[...document.querySelectorAll(".pdf-frame canvas")].some(c=>c.style.visibility==="visible"&&c.width>0));
    await page.getByRole("button",{name:"Fit page",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ca-viewer[data-fit-page] canvas')?.style.visibility==="visible");
    const viewport=page.locator(".ca-viewport");
    assert.ok(await viewport.evaluate(el=>el.getBoundingClientRect().height>150));
    await page.getByRole("button",{name:"Fit width",exact:true}).click();
    await page.screenshot({path:"test-results/pages/compact-question-phone.png"});
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"compact-viewport",result:"all nine units; two topic rows at 1440; internal list/PDF scrolling; desktop/tablet/320px/landscape without document overflow"});
  }finally{await context.close()}
});

test("Print unreviewed opens complete accessible Details and never hides the warning from worksheets", async () => {
  const catalog=JSON.parse(await readFile("public/student-questions.json","utf8"));
  const content=JSON.parse(await readFile("public/worksheet-content.json","utf8"));
  const question=catalog.questions.find(q=>q.status==="classified" && !content.questions[q.id]);
  assert.ok(question);
  const {context,page,errors}=await open(390);
  try {
    await login(page);await bankReady(page);
    await page.goto(fixture.origin+"?view=detail&question="+encodeURIComponent(question.id));
    const status=page.getByRole("button",{name:"Print unreviewed",exact:true});
    await status.waitFor();
    assert.equal(await page.locator(".ca-details").getAttribute("open"),null);
    await status.click();
    const panel=page.locator(".ca-details-panel");
    await panel.waitFor();
    assert.match(await panel.innerText(),/subparts, figures, and continuation pages/);
    assert.match(await panel.innerText(),/full source page/);
    assert.match(await panel.innerText(),/Primary topic/);
    await page.locator(".ca-details>summary").focus();
    await page.keyboard.press("Escape");
    await panel.waitFor({state:"hidden"});
    assert.equal(await page.getByRole("button",{name:"Back to results",exact:true}).isVisible(),true);
    await status.click();
    await page.screenshot({path:"test-results/pages/print-details-phone.png"});
    await page.getByRole("button",{name:"Add to worksheet",exact:true}).click();
    await panel.waitFor({state:"hidden"});
    await page.getByRole("button",{name:"Back to results",exact:true}).click();
    await page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:/Practice builder/}).click();
    await page.getByRole("heading",{name:/Practice builder/i}).waitFor();
    await page.waitForFunction(() => document.querySelector(".ca-b-note")?.textContent.includes("Full source pages"));
    assert.match(await page.locator("body").innerText(),/subparts, figures, and continuation pages/i);
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"print-details",result:"default closed; full warning and primary topic; Escape preserves phone pane; worksheet warning retained"});
  }finally{await context.close()}
});

test("Pages navigation preserves the document, authorized catalog and drafts, including Back and Forward", async () => {
  const {context,page,errors}=await open();
  try {
    await login(page);await bankReady(page);
    await page.locator(".ca-add").first().click();
    await page.evaluate(()=>window.__studentNavigationMarker="preserved");
    const start=fixture.logs.length;
    const began=Date.now();
    await page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:/Practice builder/}).click();
    await page.getByRole("heading",{name:/Practice builder/i}).waitFor();
    const elapsed=Date.now()-began;
    assert.equal(await page.title(),"ChemAtlas");
    assert.equal(await page.locator(".ca-b-item").count(),1);
    await page.getByRole("button",{name:"Question bank",exact:true}).click();
    await bankReady(page);
    await page.goBack();
    await page.getByRole("heading",{name:/Practice builder/i}).waitFor();
    await page.goForward();
    await bankReady(page);
    assert.equal(await page.evaluate(()=>window.__studentNavigationMarker),"preserved");
    assert.equal(fixture.logs.slice(start).filter(log=>log.path==="/rest/v1/approved_users" || /\/(?:student-questions|stimuli)\.json$/.test(log.path)).length,0);
    assert.equal(await page.getByRole("navigation",{name:"Main navigation"}).getByLabel("1 selected",{exact:true}).count(),1);
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"navigation-latency",result:"same document; no redundant approval/catalog/stimuli request; draft preserved through Back/Forward",localBuilderTransitionMs:elapsed});
  }finally{await context.close()}
});

test("a selected topic leaves a reachable, scrollable PDF on a short landscape screen", async () => {
  const {context,page,errors}=await open();
  try{
    await login(page);await bankReady(page);
    await page.setViewportSize({width:844,height:390});
    await page.goto(fixture.origin+"?view=detail&question=frq-2005-2-7&unit=u1&topic=1.3");
    await page.waitForFunction(()=>[...document.querySelectorAll(".pdf-frame canvas")].some(c=>c.style.visibility==="visible"&&c.width>0));
    const viewport=page.locator(".ca-viewport");
    const geometry=await viewport.evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {height:el.clientHeight,scrollable:el.scrollHeight>el.clientHeight,
        reachable:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
    });
    assert.ok(geometry.height>=60,JSON.stringify(geometry));
    assert.ok(geometry.reachable);
    assert.ok(geometry.scrollable);
    await viewport.hover();
    await page.mouse.wheel(0,160);
    await page.waitForFunction(()=>document.querySelector(".ca-viewport").scrollTop>0);
    assert.equal(await page.evaluate(()=>scrollY),0);
    await page.screenshot({path:"test-results/pages/short-landscape.png"});
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"short-landscape",result:"844x390 with selected unit/topic; reachable PDF and real wheel scrolling; bounded filter/course controls"});
  }finally{await context.close()}
});

test("expanded question Details remains fully reachable on short landscape screens", async () => {
  const {context,page,errors}=await open();
  try{
    await login(page);await bankReady(page);
    await page.setViewportSize({width:844,height:390});
    await page.goto(fixture.origin+"?view=detail&question=frq-2005-1-6");
    const summary=page.locator(".ca-details>summary");
    await summary.click();
    await page.locator(".ca-parts-box summary").click();
    const bounds=await page.locator(".ca-details-panel").evaluate(el=>{
      const r=el.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,
        bottomReachable:el.contains(document.elementFromPoint(r.left+10,r.bottom-10))};
    });
    assert.ok(bounds.top>=0&&bounds.bottom<=390&&bounds.left>=0&&bounds.right<=844,JSON.stringify(bounds));
    assert.ok(bounds.bottomReachable);
    await page.screenshot({path:"test-results/pages/short-landscape-details.png"});
    await page.keyboard.press("Escape");
    await page.locator(".ca-details-panel").waitFor({state:"hidden"});
    assert.ok(await summary.evaluate(el=>document.activeElement===el));
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"short-landscape-details",result:"expanded part details stay in viewport and remain hittable; Escape restores focus"});
  }finally{await context.close()}
});

test("compact filters clear year, type, search and pagination while retaining the selected unit and topic", async () => {
  const {context,page,errors}=await open();
  try {
    await login(page);await bankReady(page);
    await page.goto(fixture.origin+"?view=library&unit=u8&topic=8.3");
    const types=page.getByRole("group",{name:"Question type"});
    await types.waitFor();
    assert.deepEqual(await types.getByRole("button").allTextContents(),["All","MCQ","FRQ"]);
    assert.equal(await page.getByRole("checkbox",{name:"Reviewed print layout only"}).count(),0);
    const clear=page.getByRole("button",{name:"Clear filters",exact:true});
    assert.equal(await clear.isDisabled(),true);
    await types.getByRole("button",{name:"FRQ",exact:true}).click();
    await page.getByRole("combobox",{name:"Exam year"}).selectOption("2005");
    await page.getByRole("searchbox",{name:"Search questions"}).fill("2005");
    await clear.click();
    await page.waitForFunction(()=>document.querySelector('.ca-filters button[aria-pressed="true"]')?.textContent==="All"&&document.querySelector(".ca-filters select")?.value==="all"&&document.querySelector(".ca-search input")?.value==="");
    assert.equal(new URL(page.url()).searchParams.get("unit"),"u8");
    assert.equal(new URL(page.url()).searchParams.get("topic"),"8.3");
    assert.equal(await clear.isDisabled(),true);
    await page.goto(fixture.origin);
    await bankReady(page);
    await types.getByRole("button",{name:"MCQ",exact:true}).click();
    await page.getByRole("button",{name:/^Show \d+ more$/}).click();
    assert.ok(await page.locator(".ca-row-open").count()>100);
    await clear.click();
    await page.waitForFunction(()=>document.querySelectorAll(".ca-row-open").length===100);
    for(const width of [1440,1280]){
      await page.setViewportSize({width,height:900});
      await types.getByRole("button",{name:"MCQ",exact:true}).click();
      const geometry=await page.locator(".ca-filters").evaluate(el=>[...el.children].map(child=>{const r=child.getBoundingClientRect();return{cy:r.y+r.height/2,left:r.left,right:r.right}}));
      assert.ok(Math.max(...geometry.map(r=>r.cy))-Math.min(...geometry.map(r=>r.cy))<=2,"filters share one row at "+width);
      assert.ok(geometry[2].left>=geometry[1].right);
      await page.locator(".ca-filters").screenshot({path:"test-results/pages/filter-row-"+width+".png"});
      await clear.click();
    }
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"compact-filters",result:"All/MCQ/FRQ; review-only filter removed; Clear resets year/type/search/100-row pagination and preserves unit/topic; one row at 1440/1280"});
  }finally{await context.close()}
});

test("desktop header keeps complete metadata and Details in compact rows beside a wider PDF pane", async () => {
  const {context,page,errors}=await open();
  try {
    await login(page);await bankReady(page);
    await page.goto(fixture.origin+"?view=detail&unit=u9&question=frq-2005-8-14");
    await page.waitForFunction(()=>[...document.querySelectorAll(".ca-viewport canvas")].some(c=>c.width>0&&c.style.visibility==="visible"));
    for(const width of [1440,1280]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.waitForFunction(()=>!document.querySelector(".ca-viewport .pdf-wait")&&document.querySelector(".ca-viewport canvas")?.style.visibility==="visible");
      const layout=await page.evaluate(()=>{
        const pane=document.querySelector(".ca-pane").getBoundingClientRect(),work=document.querySelector(".ca-work").getBoundingClientRect();
        const meta=document.querySelector(".ca-pane-head .ca-grow p"),style=getComputedStyle(meta);
        const details=document.querySelector(".ca-details>summary").getBoundingClientRect(),mode=document.querySelector('[aria-label="Image mode"]').getBoundingClientRect();
        return {ratio:pane.width/work.width,metadata:meta.textContent,lines:meta.clientHeight/parseFloat(style.lineHeight),metadataFits:meta.scrollWidth<=meta.clientWidth+1,
          detailsY:details.y+details.height/2,modeY:mode.y+mode.height/2,toolsHeight:document.querySelector(".ca-question-tools").getBoundingClientRect().height};
      });
      assert.ok(layout.ratio>=.74&&layout.ratio<=.77,JSON.stringify(layout));
      assert.match(layout.metadata,/2005 AP Chemistry FRQ · source page 14 · 1 of 83/);
      assert.ok(layout.lines<=1.1&&layout.metadataFits,JSON.stringify(layout));
      assert.ok(Math.abs(layout.detailsY-layout.modeY)<=2,JSON.stringify(layout));
      assert.ok(layout.toolsHeight<=40,JSON.stringify(layout));
      assert.equal(await page.locator(".ca-details").getAttribute("open"),null);
      await page.screenshot({path:"test-results/pages/header-pdf-"+width+".png"});
      await page.locator(".ca-details>summary").click();
      const parts=page.locator(".ca-parts-box summary");
      if(await parts.count())await parts.click();
      const details=await page.locator(".ca-details-panel").evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,bottom:r.bottom,hit:el.contains(document.elementFromPoint(r.left+10,r.bottom-10))}});
      assert.ok(details.left>=0&&details.right<=width&&details.bottom<=900&&details.hit,JSON.stringify(details));
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button",{name:"Fit page",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ca-viewer[data-fit-page] canvas')?.style.visibility==="visible");
    await page.getByRole("button",{name:"Fit width",exact:true}).click();
    await page.getByRole("button",{name:"Full screen",exact:true}).click();
    await page.waitForFunction(()=>document.fullscreenElement?.classList.contains("ca-viewer"));
    await page.getByRole("button",{name:"Exit full screen",exact:true}).click();
    await page.waitForFunction(()=>!document.fullscreenElement);
    assert.deepEqual(errors,[]);
    evidence.push({scenario:"header-proportions",result:"complete one-line source metadata; Details shares action row; 24/76 at 1440 and usable 25/75 at 1280; unclipped Details; PDF fit/fullscreen retained"});
  }finally{await context.close()}
});

async function settleWave(page) {
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    let previous="",stable=0,frames=0;
    const sample=()=>{
      const current=[...document.querySelectorAll('.ca-unit-wave-stage .ca-unit-sheet.is-deep')].map(el=>{const r=el.getBoundingClientRect();return[r.x,r.y,r.width,r.height].map(n=>n.toFixed(3)).join()}).join(";");
      stable=current===previous?stable+1:0;previous=current;
      if(stable>=3)resolve();else if(++frames>120)reject(new Error('Unit wave did not settle'));else requestAnimationFrame(sample);
    };requestAnimationFrame(sample);
  }));
}

test("unit wave preserves full names, colors, fixed slots, selection and responsive navigation", async () => {
  const {context,page,errors}=await open();
  try {
    await login(page);await bankReady(page);
    await page.waitForFunction(()=>[...document.querySelectorAll('.ca-viewport canvas')].some(c=>c.width>0&&c.style.visibility==='visible'));
    await page.emulateMedia({reducedMotion:"no-preference"});
    const snapshot=()=>page.evaluate(()=>({url:location.href,selected:[...document.querySelectorAll('.ca-unit[aria-pressed="true"]')].map(el=>el.dataset.u),results:[...document.querySelectorAll('.ca-rows>[data-id]')].map(el=>el.dataset.id),cards:[...document.querySelectorAll('.ca-units>.ca-unit')].map(el=>{const r=el.getBoundingClientRect();return[r.x,r.y,r.width,r.height]})}));
    for(const [width,height] of [[1440,900],[1280,900],[768,900],[844,390]]){
      await page.setViewportSize({width,height});await page.mouse.move(0,400);
      const before=await snapshot();
      for(let unit=1;unit<=9;unit++){
        const card=page.getByRole('button',{name:new RegExp('^Unit '+unit+',')});
        await card.hover();await settleWave(page);
        const result=await page.locator(`.ca-unit-wave-stage .ca-unit-highlight[data-u="u${unit}"]`).evaluate(el=>{
          const box=el.querySelector('.is-deep').getBoundingClientRect(),name=el.querySelector(':scope>span'),nameBox=name.getBoundingClientRect();
          const source=document.querySelector(`.ca-unit[data-u="${el.dataset.u}"]`),slot=source.getBoundingClientRect();
          const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
          ctx.fillStyle=getComputedStyle(el.querySelector('.is-deep')).backgroundColor;ctx.fillRect(0,0,1,1);
          const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});
          return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height,
            slot:{left:slot.left,right:slot.right,top:slot.top,bottom:slot.bottom,width:slot.width,height:slot.height},
            name:name.textContent,nameOpacity:Number(name.style.opacity),nameFits:nameBox.left>=box.left&&nameBox.right<=box.right&&nameBox.bottom<=box.bottom,
            segments:el.querySelectorAll('.ca-heat:not(:last-child) i').length||el.querySelectorAll('.ca-heat i').length,
            contrast:1.05/(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]+.05),pointer:getComputedStyle(el).pointerEvents};
        });
        assert.equal(result.name,(await card.getAttribute('aria-label')).split(', ').slice(1,-1).join(', '));
        assert.ok(result.left>=7&&result.right<=width-7&&result.nameFits,JSON.stringify({unit,width,result}));
        assert.ok(result.top<result.slot.top&&result.bottom<result.slot.bottom,JSON.stringify(result));
        assert.ok(result.width<=Math.max(result.slot.width+12,224)+1&&result.height<=Math.max(result.slot.height+6,66)+1,'peak is smaller than the former 264px tab');
        assert.ok(result.nameOpacity>.99&&result.contrast>=4.5&&result.segments>0);
        assert.equal(result.pointer,'none');
        assert.deepEqual(await snapshot(),before,'wave never moves click slots or filters questions');
        if(unit===4)await page.screenshot({path:`test-results/pages/unit-wave-u4-${width}x${height}.png`});
      }
      await page.mouse.move(0,400);
      await page.waitForFunction(()=>!document.querySelector('.ca-unit-wave-stage'));
      assert.deepEqual(await snapshot(),before);
    }
    await page.getByRole('button',{name:/^Unit 3,/}).focus();await page.keyboard.press('Tab');
    assert.equal(await page.locator('.ca-unit-wave-stage [data-u="u4"]>span').first().evaluate(el=>el.style.opacity),'1');
    const four=page.getByRole('button',{name:/^Unit 4,/});await four.press('Enter');
    assert.equal(await four.getAttribute('aria-pressed'),'true');
    await four.hover();await settleWave(page);
    assert.equal(await four.evaluate(el=>document.querySelector('.ca-unit-wave-stage [data-u="u4"] .is-deep').getBoundingClientRect().width>el.getBoundingClientRect().width),true);
    const all=page.locator('.ca-unit.is-all');await all.click();assert.equal(await all.getAttribute('aria-pressed'),'true');
    await page.emulateMedia({reducedMotion:'reduce'});
    const reduced=await four.evaluate(button=>{
      const r=button.getBoundingClientRect();button.parentElement.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
      const stage=document.querySelector('.ca-unit-wave-stage');return{animations:stage.getAnimations({subtree:true}).length,title:stage.querySelector('[data-u="u4"]>span').style.opacity};
    });
    assert.deepEqual(reduced,{animations:0,title:'1'});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.ca-unit-wave-stage').count(),0);
    await four.click();assert.equal(await four.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.ca-unit-wave-stage').count(),0);
    assert.deepEqual(errors,[]);
    evidence.push({scenario:'unit-wave-layout',result:'all nine reduced peaks and full titles at 1440/1280/768/844x390; fixed geometry and filters; keyboard, selected card, All, reduced motion and phone preserved'});
  }finally{await context.close()}
});

test("one cursor-proximity field coordinates neighbors, within-card motion, fast sweeps and reversals", async () => {
  const {context,page,errors}=await open();
  try {
    await login(page);await bankReady(page);await page.emulateMedia({reducedMotion:'no-preference'});
    await page.waitForFunction(()=>[...document.querySelectorAll('.ca-viewport canvas')].some(c=>c.width>0&&c.style.visibility==='visible'));
    const rect=await page.locator('.ca-unit[data-u="u4"]').boundingBox();
    const values=()=>page.evaluate(()=>[...document.querySelectorAll('.ca-unit-wave-stage .ca-unit-highlight[data-u]')].map(el=>({unit:el.dataset.u,width:el.querySelector('.is-deep').getBoundingClientRect().width,top:el.querySelector('.is-deep').getBoundingClientRect().top})));
    await page.mouse.move(rect.x+rect.width*.12,rect.y+rect.height/2);await settleWave(page);const shoulder=await values();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await settleWave(page);const peak=await values();
    assert.ok(peak.find(v=>v.unit==='u4').width>shoulder.find(v=>v.unit==='u4').width+5,'proximity changes inside the same button');
    assert.ok(peak.find(v=>v.unit==='u3').top<rect.y-1&&peak.find(v=>v.unit==='u5').top<rect.y-1,'both immediate neighbors rise');
    assert.ok(Math.abs(peak.find(v=>v.unit==='u9').top-rect.y)<.5,'far units taper to rest');
    const transition=await page.evaluate(()=>new Promise(resolve=>{
      const row=document.querySelector('.ca-units'),stage=document.querySelector('.ca-unit-wave-stage'),next=document.querySelector('.ca-unit[data-u="u5"]').getBoundingClientRect();
      const sample=()=>['u4','u5'].map(id=>document.querySelector(`.ca-unit-wave-stage [data-u="${id}"] .is-deep`).getBoundingClientRect().width);
      const before=sample();row.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:next.x+next.width/2}));
      const immediate=sample();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({before,immediate,after:sample(),sameStage:stage===document.querySelector('.ca-unit-wave-stage')})));
    }));
    assert.deepEqual(transition.immediate,transition.before,'target changes never snap the current pose');
    assert.ok(transition.after[0]<transition.before[0]&&transition.after[1]>transition.before[1],'outgoing and incoming respond within two frames');
    assert.equal(transition.sameStage,true);
    for(const unit of [3,7,9,2,8,1,4]){
      const box=await page.locator(`.ca-unit[data-u="u${unit}"]`).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    }
    await settleWave(page);
    const end=await values();assert.equal(end.reduce((best,item)=>item.top<best.top?item:best).unit,'u4');
    await page.screenshot({path:'test-results/pages/unit-wave-neighbors.png'});
    await page.mouse.move(600,400);await page.waitForFunction(()=>!document.querySelector('.ca-unit-wave-stage'));
    assert.equal(await page.locator('.ca-unit[data-wave]').count(),0);
    assert.deepEqual(errors,[]);
    evidence.push({scenario:'unit-wave-motion',result:'continuous within-card proximity; both neighbors respond; distant taper; simultaneous response within two frames; rapid full-row sweeps and reversals preserve one stage and settle cleanly'});
  }finally{await context.close()}
});
