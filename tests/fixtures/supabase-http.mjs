// Loopback-only Supabase protocol fixture. Auth is simulated; authorization runs
// the production migration in actual embedded PostgreSQL, with real RLS roles.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { approved, unapproved, setup } from "./supabase-db.mjs";
import { contentFiles } from "../../scripts/pages/content-manifest.mjs";

const fixtureKey = "loopback-test-signature-key";
const sign = value => createHmac("sha256", fixtureKey).update(value).digest("base64url");
function token(user) {
  const value = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, email: user.email, aud: "authenticated", role: "authenticated", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}`;
  return `${value}.${sign(value)}`;
}
function identity(header = "") {
  const [first, second, signature] = header.replace(/^Bearer /, "").split(".");
  if (!first || !second || !signature) return null;
  const expected = Buffer.from(sign(`${first}.${second}`)), actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const claims = JSON.parse(Buffer.from(second, "base64url").toString());
  if (claims.exp < Date.now() / 1000) return null;
  return claims;
}
export async function startFixture({ artifactDirectory = "dist-pages" } = {}) {
  const db = new PGlite();
  await db.exec(setup);
  await db.exec(await readFile("supabase/migrations/202611180001_approved_student_content.sql", "utf8"));
  await db.query("insert into public.approved_users(user_id) values ($1)", [approved]);
  for (const name of [...contentFiles, "stimuli.json"]) await db.query("insert into storage.objects(bucket_id,name) values ('chematlas-content',$1)", [`shared/releases/fixture/${name}`]);
  const logs = [];
  let logoutPause;
  let serial = Promise.resolve();
  function query(claims, sql, params = []) {
    const next = serial.then(async () => {
      await db.exec("begin");
      try {
        await db.exec(`set local role ${claims ? "authenticated" : "anon"}`);
        await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims ?? {})]);
        return await db.query(sql, params);
      } finally { await db.exec("rollback"); }
    });
    serial = next.catch(() => {});
    return next;
  }
  const api = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4173");
    res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,accept,range,cache-control,prefer,x-supabase-api-version,accept-profile,content-profile,x-retry-count");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length,Content-Range,Accept-Ranges");
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const path = new URL(req.url, "http://127.0.0.1:54321").pathname;
    const claims = identity(req.headers.authorization);
    logs.push({ method: req.method, path, principal: claims?.sub ?? null });
    const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    try {
      if (path === "/auth/v1/token") {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const input = JSON.parse(Buffer.concat(chunks).toString());
        if (input.password !== "fixture-password") return json(400, { error: "invalid_grant", error_description: "Invalid credentials" });
        const user = { id: input.email === "approved@example.test" ? approved : unapproved, email: input.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
        return json(200, { access_token: token(user), token_type: "bearer", expires_in: 3600, refresh_token: "fixture-refresh", user });
      }
      if (path === "/auth/v1/user") return claims ? json(200, { id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} }) : json(401, { message: "Unauthorized" });
      if (path === "/auth/v1/logout") {
        const pause = logoutPause;
        pause?.signal();
        await pause?.pending;
        res.writeHead(204); res.end(); return;
      }
      if (path === "/auth/v1/recover") return json(200, {});
      if (path === "/rest/v1/approved_users") {
        if (req.method === "GET") return json(200, (await query(claims, "select user_id from public.approved_users where revoked_at is null")).rows);
        await query(claims, "insert into public.approved_users(user_id) values ($1)", [claims?.sub ?? unapproved]);
        return json(201, {});
      }
      if (path.startsWith("/storage/v1/object/")) {
        const logical = path.replace(/^\/storage\/v1\/object\/(?:authenticated\/|public\/)?chematlas-content\//, "");
        if (!path.startsWith("/storage/v1/object/authenticated/") || !claims) return json(403, { message: "Unauthorized" });
        if (req.method === "DELETE") return json(200, (await query(claims, "delete from storage.objects where bucket_id='chematlas-content' and name=$1 returning name", [logical])).rows);
        if (["POST", "PUT", "PATCH"].includes(req.method)) {
          await query(claims, "insert into storage.objects(bucket_id,name) values ('chematlas-content',$1)", [logical]);
          return json(201, {});
        }
        const { rows } = await query(claims, "select name from storage.objects where bucket_id='chematlas-content' and name=$1", [logical]);
        if (!rows.length) return json(403, { message: "Unauthorized" });
        const name = logical.replace(/^shared\/releases\/fixture\//, "");
        if (![...contentFiles, "stimuli.json"].includes(name)) return json(404, {});
        let bytes = await readFile(name === "stimuli.json" ? "research/stimuli.json" : `public/${name}`);
        const total = bytes.length;
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
        if (range) {
          const start = Number(range[1]), end = Math.min(Number(range[2] || total - 1), total - 1);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
          bytes = bytes.subarray(start, end + 1);
        }
        res.writeHead(range ? 206 : 200, { "Content-Type": name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".json") ? "application/json" : "text/plain", "Accept-Ranges": "bytes", "Content-Length": bytes.length });
        res.end(req.method === "HEAD" ? undefined : bytes); return;
      }
      json(404, {});
    } catch (error) { json(error.code === "42501" ? 403 : 500, { message: error.message }); }
  });
  const site = createServer(async (req, res) => {
    const path = new URL(req.url, "http://127.0.0.1:4173").pathname;
    if (!path.startsWith("/ChemAtlas/") || path.includes("..")) { res.writeHead(404); res.end(); return; }
    const name = path.slice("/ChemAtlas/".length) + (path.endsWith("/") ? "index.html" : "");
    try {
      const bytes = await readFile(resolve(artifactDirectory, name));
      const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[extname(name)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime }); res.end(bytes);
    } catch { res.writeHead(404); res.end("Not found"); }
  });
  await new Promise(resolve => api.listen(54321, "127.0.0.1", resolve));
  await new Promise(resolve => site.listen(4173, "127.0.0.1", resolve));
  return { logs, api: "http://127.0.0.1:54321", origin: "http://127.0.0.1:4173/ChemAtlas/",
    pauseLogout() {
      let release, signal;
      const pending = new Promise(resolve => { release = resolve; });
      const entered = new Promise(resolve => { signal = resolve; });
      logoutPause = { pending, signal };
      return { entered, release() { logoutPause = undefined; release(); } };
    },
    async revoke(value) { await serial; await db.query("update public.approved_users set revoked_at=$1 where user_id=$2", [value ? new Date().toISOString() : null, approved]); },
    async close() { api.closeAllConnections(); site.closeAllConnections(); await Promise.all([new Promise(resolve => api.close(resolve)), new Promise(resolve => site.close(resolve))]); await db.close(); } };
}
