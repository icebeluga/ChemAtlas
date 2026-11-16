const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { generateKeyPairSync, sign } = require("node:crypto");
const { once } = require("node:events");
const { readFileSync, readdirSync, realpathSync } = require("node:fs");
const { createRequire } = require("node:module");
const { resolve } = require("node:path");

const args = process.argv.slice(2);
assert.ok(!args.length || (args.length === 1 && args[0] === "--browser-regressions"),
  "Usage: node scripts/release/smoke.cjs [--browser-regressions]");

const vitePluginRequire = createRequire(realpathSync("node_modules/@cloudflare/vite-plugin/package.json"));
const miniflarePath = vitePluginRequire.resolve("miniflare");
const localDate = createRequire(miniflarePath)("workerd").compatibilityDate;
const { Miniflare } = require(miniflarePath);
const { MockAgent } = createRequire(miniflarePath)("undici");
const { chromium } = require(process.env.CHEMATLAS_PLAYWRIGHT || "playwright");
const config = JSON.parse(readFileSync("dist/server/wrangler.json"));
const version = JSON.parse(readFileSync("dist/client/student-version.json"));
const issuer = "https://local-fixture.cloudflareaccess.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(audience) {
  const header = encode({ alg: "RS256", kid: "local" });
  const claims = encode({ iss: issuer, aud: [audience], sub: "local", email: "student@example.test",
    exp: Math.floor(Date.now() / 1000) + 600 });
  const input = header + "." + claims;
  return input + "." + sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
}
const allowed = token("qa");
const denied = token("wrong-audience");
const mock = new MockAgent();
mock.disableNetConnect();
mock.get(issuer).intercept({ path: "/cdn-cgi/access/certs" }).reply(200, {
  keys: [{ ...publicKey.export({ format: "jwk" }), kid: "local" }],
}).persist();

const worker = new Miniflare({
  host: "127.0.0.1", port: 0, compatibilityDate: config.compatibility_date < localDate ? config.compatibility_date : localDate,
  compatibilityFlags: config.compatibility_flags, modulesRoot: resolve("dist/server"),
  modules: [config.main, ...readdirSync("dist/server", { recursive: true })
    .filter(path => path !== config.main && /\.m?js$/.test(path))]
    .map(path => ({ type: "ESModule", path: resolve("dist/server", path),
      contents: readFileSync(resolve("dist/server", path), "utf8") })),
  bindings: { CF_ACCESS_TEAM_DOMAIN: new URL(issuer).hostname, CHEMATLAS_STUDENT_ACCESS_AUD: "qa" },
  fetchMock: mock,
  assets: { directory: resolve("dist/server", config.assets.directory), binding: config.assets.binding,
    routerConfig: { invoke_user_worker_ahead_of_assets: true, has_user_worker: true } },
});

async function smoke() {
  const origin = await worker.ready;
  console.log("Local Worker compatibility date:", config.compatibility_date < localDate ? config.compatibility_date : localDate);
  const request = (path, jwt, method = "GET") => fetch(new URL(path, origin), {
    method, headers: jwt ? { "cf-access-jwt-assertion": jwt } : {},
  });
  const html = await (await request("/", allowed)).text();
  const bundles = [...new Set(html.match(/\/_next\/static\/[^"'<>\\ ]+?\.(?:css|js)/g))];
  assert.ok(bundles.some(path => path.endsWith(".css")) && bundles.some(path => path.endsWith(".js")));
  const catalog = JSON.parse(readFileSync("dist/client/student-questions.json"));
  const paths = ["/", "/practice-builder", "/questions.json", "/student-questions.json",
    "/student-version.json", "/pdf.worker.min.mjs", "/worksheet-content.json", "/worksheet-sources.json",
    "/worksheet-fragments.pdf", ...catalog.sourceFiles.map(source => source.url), ...bundles];
  for (const path of paths) {
    for (const [jwt, status] of [[allowed, 200], [null, 403], [denied, 403]]) {
      const response = await request(path, jwt, "HEAD");
      assert.equal(response.status, status, path);
      assert.equal(response.headers.get("cache-control"), "private, no-store", path);
      await response.body?.cancel();
    }
  }
  assert.deepEqual(await (await request("/student-version.json", allowed)).json(), version);
  for (const path of ["/admin/question-review", "/api/admin/question-review",
    "/api/admin/question-review/backup", "/api/admin/question-review/backup/import"]) {
    for (const jwt of [allowed, null]) {
      const response = await request(path, jwt);
      assert.equal(response.status, 404, path);
      await response.body?.cancel();
    }
    const response = await request(path, allowed, "POST");
    assert.equal(response.status, 404, path);
    await response.body?.cancel();
  }
  console.log("PASS Worker access, protected version, JS/CSS, catalogs, worksheet assets, PDFs, admin/backup denial");

  const browser = await chromium.launch({ executablePath: process.env.CHEMATLAS_CHROMIUM });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route(origin.origin + "/**", route => route.continue({
        headers: { ...route.request().headers(), "cf-access-jwt-assertion": allowed },
      }));
      await page.goto(origin.href);
      await page.getByRole("heading", { name: /Browse by unit/i }).waitFor();
      await page.getByRole("button", { name: /Unit 1.*Atomic Structure and Properties/i }).first().click();
      await page.getByRole("heading", { name: "Atomic Structure and Properties", exact: true }).waitFor();
      await page.goto(new URL("/?view=library", origin).href);
      await page.locator(".catalog-row").first().waitFor();
      await page.goto(new URL("/?view=detail&question=mcq-2008-1-29", origin).href);
      await page.locator("canvas").first().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some(canvas => canvas.style.width && canvas.width > 200));
      await page.goto(new URL("/practice-builder", origin).href);
      await page.getByRole("heading", { name: "Practice Builder", exact: true }).waitFor();
      await page.getByText("0 selected", { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      await page.close();
      console.log("PASS browser Browse, unit, bank, PDF detail and Practice Builder at width", viewport.width);
    }
  } finally {
    await browser.close();
  }

  if (args.length) {
    const child = spawn(process.execPath, [
      "--test", "--test-concurrency=1", "--test-timeout=120000",
      "tests/student-redesign.browser.mjs", "tests/student-state.browser.mjs",
    ], {
      stdio: "inherit",
      env: { ...process.env, CHEMATLAS_TEST_ORIGIN: origin.origin, CHEMATLAS_TEST_ACCESS_TOKEN: allowed },
    });
    const [code, signal] = await once(child, "exit");
    assert.equal(code, 0, `Student browser regressions failed (${signal ?? code})`);
    console.log("PASS both student browser regression suites");
  }
}

smoke().finally(() => worker.dispose()).catch(error => { console.error(error); process.exitCode = 1; });
