import assert from "node:assert/strict";
import { appendFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workerName = "chematlas-student-private";
const hostname = `${workerName}.chematlas-hub.workers.dev`;
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
assert.ok(account && /^[a-f\d]{32}$/i.test(account) && token, "Cloudflare Actions secrets are missing or invalid.");
const api = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const worker = `/workers/scripts/${workerName}`;
const config = "dist/server/wrangler.release.json";
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

async function get(path, label) {
  const response = await fetch(api + path, {
    headers: { Authorization: `Bearer ${token}`, "Cloudflare-Workers-Script-Api-Date": "2025-08-01" },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Cannot verify ${label} (Cloudflare HTTP ${response.status}). Check the token's read permissions.`);
  }
  const payload = await response.json();
  assert.ok(payload.success && payload.result, `Cannot verify ${label} from the Cloudflare response.`);
  return payload;
}

async function list(path, label) {
  const items = [];
  for (let page = 1; ; page++) {
    const { result, result_info: info } = await get(`${path}?per_page=50&page=${page}`, label);
    assert.ok(Array.isArray(result), `Unexpected ${label} response.`);
    items.push(...result);
    if (info?.total_pages != null ? page >= info.total_pages : result.length < 50) return items;
    assert.ok(page < 100, `Could not enumerate all ${label}.`);
  }
}

async function activeVersion() {
  const { result } = await get(`${worker}/deployments`, "active production deployment");
  const [latest] = [...result.deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on));
  const version = latest?.versions?.[0];
  assert.ok(latest?.versions?.length === 1 && version?.percentage === 100 && uuid.test(version.version_id),
    "A single active production version is required for automatic rollback.");
  return version.version_id;
}

async function checkAnonymousAccess() {
  const files = readdirSync("dist/client/_next/static", { recursive: true });
  const css = files.find((file) => file.endsWith(".css"));
  const js = files.find((file) => file.endsWith(".js"));
  assert.ok(css && js, "Missing browser assets for anonymous probes.");
  const paths = ["/", "/questions.json", "/curriculum-topics.json", "/source/bank-01.pdf",
    `/_next/static/${css}`, `/_next/static/${js}`];
  const loginOrigins = await Promise.all(paths.map(async (path) => {
    const response = await fetch(`https://${hostname}${path}`, {
      redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    const location = response.headers.get("location");
    const login = location && new URL(location, response.url);
    assert.ok(response.status === 302 && login?.protocol === "https:"
      && login.hostname.endsWith(".cloudflareaccess.com")
      && login.pathname === `/cdn-cgi/access/login/${hostname}`,
    `Expected the Cloudflare Access login redirect for ${path} (HTTP ${response.status}).`);
    return login.origin;
  }));
  assert.ok(loginOrigins.every((origin) => origin === loginOrigins[0]),
    "The student hostname uses multiple Access login origins.");
  return new URL(loginOrigins[0]).hostname;
}

async function productionSettings({ requireAssets = false } = {}) {
  const [workers, apps, subdomain, settings, loginTeam] = await Promise.all([
    list("/workers/workers", "Worker identity"),
    list("/access/apps", "Access applications"),
    get(`${worker}/subdomain`, "Worker hostname and preview settings"),
    get(`${worker}/settings`, "Worker bindings"),
    checkAnonymousAccess(),
  ]);
  const matches = workers.filter(({ name }) => name === workerName);
  assert.ok(matches.length === 1 && matches[0].id, "Existing student Worker identity could not be confirmed.");
  const [existing] = matches;
  const sub = subdomain.result;
  assert.ok(sub.enabled === true && sub.previews_enabled === false,
    "Live hostname or preview settings differ from the release configuration.");
  if (sub.url) assert.ok(new URL(sub.url).hostname === hostname, "Unexpected live Worker hostname.");
  else {
    const { result } = await get("/workers/subdomain", "account workers.dev hostname");
    assert.ok(result.subdomain === "chematlas-hub", "Unexpected account workers.dev subdomain.");
  }

  const accessApps = apps.filter((app) => app.destinations?.some(
    (destination) => destination.type === "worker" && destination.worker_id === existing.id,
  ));
  assert.ok(accessApps.length === 1 && accessApps[0].id && accessApps[0].aud,
    "Could not verify a unique Worker-level Access application covering all student traffic.");
  const [app] = accessApps;
  const overrides = apps.some((candidate) => candidate.id !== app.id && [
    candidate.domain,
    ...(candidate.self_hosted_domains ?? []),
    ...(candidate.destinations ?? []).filter(({ type }) => type === "public").map(({ uri }) => uri),
  ].some((uri) => {
    const host = uri?.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    return host === hostname || (host?.startsWith("*.") && hostname.endsWith(host.slice(1)));
  }));
  assert.ok(!overrides, "A hostname or path Access application may override the student Worker policy.");
  const policies = await list(`/access/apps/${encodeURIComponent(app.id)}/policies`, "student Access policies");
  assert.ok(policies.length > 0 && policies.every(({ decision }) => ["allow", "deny"].includes(decision)),
    "Student Access policy contains a bypass, service authentication, or an unsupported decision.");
  const allow = policies.filter(({ decision }) => decision === "allow");
  assert.ok(allow.length > 0 && allow.every(({ include }) => Array.isArray(include) && include.length > 0
    && include.every((rule) => Object.keys(rule).length === 1
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rule.email?.email ?? ""))),
  "Could not verify a student email allowlist.");

  const bindings = settings.result.bindings;
  assert.ok(Array.isArray(bindings), "Could not inspect live Worker bindings.");
  if (requireAssets) assert.ok(bindings.some(({ name, type }) => name === "ASSETS" && type === "assets"),
    "Cloudflare did not report the deployed ASSETS binding.");
  const retainedTypes = ["plain_text", "json", "secret_text", "secret_key"];
  assert.ok(bindings.every(({ name, type }) => retainedTypes.includes(type)
    || (name === "ASSETS" && type === "assets")),
  "The live Worker has a binding that the release configuration cannot preserve.");
  for (const [name, expected] of [
    ["CF_ACCESS_TEAM_DOMAIN", loginTeam],
    ["CHEMATLAS_STUDENT_ACCESS_AUD", app.aud],
  ]) {
    const binding = bindings.find((entry) => entry.name === name);
    assert.ok(binding && ["plain_text", "secret_text"].includes(binding.type), `Missing or invalid ${name} binding.`);
    if (binding.type === "plain_text") {
      const value = name === "CF_ACCESS_TEAM_DOMAIN"
        ? binding.text?.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase()
        : binding.text?.trim();
      assert.ok(value === expected, `${name} does not match the live Access application.`);
    }
  }

  return {
    app,
    policies: policies.sort((a, b) => String(a.id).localeCompare(String(b.id))),
    subdomain: [sub.enabled, sub.previews_enabled, hostname],
    bindings: bindings.filter(({ type }) => retainedTypes.includes(type))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function record(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}

function wrangler(args) {
  const result = spawnSync("pnpm", ["exec", "wrangler", ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Wrangler ${args[0]} failed.`);
}

try {
  const before = await productionSettings();
  const previous = await activeVersion();
  record(`Rollback version for ${workerName}: ${previous}`);
  record("Verified the existing student hostname, Worker bindings, email allowlist, and anonymous Access redirects.");
  if (process.env.DEPLOY_APPROVED === "true") {
    try {
      wrangler(["deploy", "--config", config, "--keep-vars"]);
      const deployed = await activeVersion();
      assert.ok(deployed !== previous, "Cloudflare did not report a new active production version.");
      // Compare in memory so Access rules and environment values stay out of logs.
      assert.ok(JSON.stringify(await productionSettings({ requireAssets: true })) === JSON.stringify(before),
        "Production Access or Worker settings changed during deployment.");
      record(`Active production version: ${deployed}`);
      record("Anonymous requests still require Cloudflare Access. Signed-in browser verification is pending.");
    } catch (error) {
      record(error.message);
      // A failed command can still have activated a version. If status cannot
      // be read, attempt rollback using the verified pre-deploy version.
      const current = await activeVersion().catch(() => null);
      if (current !== previous) {
        try {
          wrangler(["rollback", previous, "--config", config, "--yes", "--message", "Restore pre-release student Worker"]);
          assert.ok(await activeVersion() === previous, "Rollback version could not be verified.");
          await checkAnonymousAccess();
          record(`Restored production version: ${previous}`);
        } catch {
          throw new Error(`Automatic rollback could not be verified. Restore version ${previous} in Cloudflare immediately.`);
        }
      }
      throw new Error("Production deployment failed validation.");
    }
  } else {
    record("Read-only preflight completed. Production deployment was skipped.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
