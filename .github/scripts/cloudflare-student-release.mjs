import assert from "node:assert/strict";
import { appendFileSync, readdirSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { spawnSync } from "node:child_process";

const workerName = "chematlas-student-private";
const hostname = `${workerName}.chematlas-hub.workers.dev`;
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
assert.ok(account && /^[a-f\d]{32}$/i.test(account) && token, "Cloudflare Actions secrets are missing or invalid.");
const api = "https://api.cloudflare.com/client/v4";
const accountPath = `/accounts/${account}`;
const worker = `/workers/scripts/${workerName}`;
const config = "dist/server/wrangler.release.json";
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

async function get(path, label, scope = accountPath) {
  const response = await fetch(api + scope + path, {
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

async function list(path, label, scope) {
  const items = [];
  for (let page = 1; ; page++) {
    const { result, result_info: info } = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=50&page=${page}`, label, scope);
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
  const logins = await Promise.all(paths.map(async (path) => {
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
    return login;
  }));
  const origin = logins[0].origin;
  assert.ok(logins.every((login) => login.origin === origin), "The student hostname uses multiple Access login origins.");
  const response = await fetch(`${origin}/cdn-cgi/access/certs`, {
    redirect: "error", signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, "Could not read the Access team's public signing keys.");
  const { keys } = await response.json();
  assert.ok(Array.isArray(keys), "Unexpected Access signing key response.");
  const identities = logins.map((login, index) => {
    const parts = login.searchParams.get("meta")?.split(".");
    assert.ok(parts?.length === 3 && parts.every((part) => /^[\w-]+$/.test(part)),
      "Access redirect did not provide signed application metadata.");
    const [header, payload, signature] = parts;
    const { alg, kid } = JSON.parse(Buffer.from(header, "base64url"));
    const key = keys.find((entry) => entry.kid === kid && entry.kty === "RSA");
    assert.ok(alg === "RS256" && key && verify("RSA-SHA256", Buffer.from(`${header}.${payload}`),
      createPublicKey({ key, format: "jwk" }), Buffer.from(signature, "base64url")),
    "Could not verify the Access redirect signature.");
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    const now = Date.now() / 1000;
    assert.ok(claims.type === "meta" && claims.hostname === hostname && claims.redirect_url === paths[index]
      && /^[a-f\d]{64}$/i.test(claims.aud ?? "")
      && Number.isFinite(claims.exp) && claims.exp > now
      && (claims.nbf === undefined || (Number.isFinite(claims.nbf) && claims.nbf <= now + 30)),
    "Access redirect metadata did not establish a current audience for the student hostname.");
    return { audience: claims.aud, workerId: claims.worker_id ?? null };
  });
  assert.ok(identities.every(({ audience, workerId }) => audience === identities[0].audience
    && workerId === identities[0].workerId), "Student URLs returned different Access application identities.");
  return { ...identities[0], team: new URL(origin).hostname };
}

function publicDestinations(app) {
  return [
    ...(app.destinations ?? []).filter(({ type }) => type === "public"),
    ...[app.domain, ...(app.self_hosted_domains ?? [])].filter(Boolean).map((uri) => ({ uri })),
  ];
}

function destinationHost(uri) {
  return uri?.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase().replace(/\.$/, "");
}

function matchesHostname(uri) {
  const host = destinationHost(uri);
  if (!host) return false;
  const pattern = host.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${pattern}$`).test(hostname);
}

async function verifyOnlyStudentHostname() {
  const { result: domains } = await get(`/workers/domains?service=${workerName}`, "student custom domains");
  assert.ok(Array.isArray(domains) && domains.length === 0,
    "Hostname-based Access cannot establish coverage for additional student custom domains.");
  const zones = await list(`/zones?account.id=${account}`, "account zones for student Worker route verification", "");
  for (const { id } of zones) {
    assert.ok(typeof id === "string" && /^[a-f\d]{32}$/i.test(id), "Could not verify an account zone identity.");
    const { result: routes } = await get(`/zones/${id}/workers/routes`, "account zone Worker routes", "");
    assert.ok(Array.isArray(routes) && routes.every(({ script }) => script !== workerName),
      "Hostname-based Access cannot establish coverage for additional student Worker routes.");
  }
}

async function resolveAccessApplication(apps, workerId, login) {
  const candidates = await list(`/access/apps?aud=${encodeURIComponent(login.audience)}`, "Access application by signed audience");
  const listed = apps.filter(({ aud }) => aud === login.audience);
  assert.ok(listed.length <= 1 && (!listed.length || listed[0].id === candidates[0]?.id),
    "Cloudflare Access application lists disagree on the signed student audience.");
  assert.ok(candidates.length === 1 && candidates[0].id,
    "The Access API did not return a unique application for the signed student redirect audience.");
  const { result: app } = await get(`/access/apps/${encodeURIComponent(candidates[0].id)}`, "student Access application details");
  assert.ok(app.id === candidates[0].id && app.aud === login.audience && app.type === "self_hosted",
    "The Access application details did not confirm the signed student redirect audience.");

  const destinations = app.destinations ?? [];
  const workerDestinations = destinations.filter((entry) => entry.type === "worker" && entry.worker_id === workerId);
  const hostnameDestinations = publicDestinations(app).filter(({ uri }) => matchesHostname(uri));
  const accountDestinations = destinations.filter(({ type }) => type === "all_workers");
  assert.ok(hostnameDestinations.every(({ uri, overrides }) =>
    uri?.replace(/^https?:\/\//i, "").toLowerCase().replace(/\/$/, "") === hostname && !overrides?.length),
  "The matched application has a student hostname path restriction, wildcard, or override.");

  let coverage;
  if (workerDestinations.length) {
    assert.ok(workerDestinations.length === 1 && !workerDestinations[0].overrides?.length,
      "The Access API did not establish full Worker coverage without destination overrides.");
    coverage = "Worker-level";
  } else if (hostnameDestinations.length) {
    await verifyOnlyStudentHostname();
    coverage = "hostname-based";
  } else {
    assert.ok(accountDestinations.length === 1 && !accountDestinations[0].overrides?.length,
      "The Access API did not establish full account-wide Worker coverage without destination overrides.");
    coverage = "account-wide";
  }

  // List summaries can omit destinations. Inspect other applications before
  // ruling out a more-specific policy on a path the probes do not cover.
  const otherApps = [];
  for (const { id } of apps) {
    assert.ok(typeof id === "string" && id, "An Access application summary did not include its ID.");
    if (id === app.id) continue;
    const { result } = await get(`/access/apps/${encodeURIComponent(id)}`, "potential Access policy overrides");
    assert.ok(result.id === id, "Could not confirm the identity of another Access application.");
    otherApps.push(result);
  }
  const competing = otherApps.some((candidate) => (
    publicDestinations(candidate).some(({ uri }) => matchesHostname(uri))
    || (candidate.destinations ?? []).some((entry) =>
      (entry.type === "worker" && entry.worker_id === workerId)
      || (entry.type === "all_workers" && coverage === "account-wide"))
  ));
  assert.ok(!competing, "A separate Access destination could override the verified student policy.");
  return { app, coverage };
}

async function productionSettings({ requireAssets = false } = {}) {
  const [workers, apps, subdomain, settings, login] = await Promise.all([
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

  assert.ok(!login.workerId || login.workerId === existing.id,
    "The signed student redirect Worker ID does not match the Cloudflare Worker API.");
  const { app, coverage } = await resolveAccessApplication(apps, existing.id, login);
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
    ["CF_ACCESS_TEAM_DOMAIN", login.team],
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
    coverage,
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
  record(`Verified ${before.coverage} Access, the student hostname, Worker bindings, email allowlist, and anonymous Access redirects.`);
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
