import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  authenticateStudentRequest, clearStudentAccessKeyCacheForTests, isRestrictedStudentPath,
} from "../lib/student-access.mjs";

const now = Date.parse("2026-11-12T12:00:00Z");
const env = {
  CF_ACCESS_TEAM_DOMAIN: "chematlas-test.cloudflareaccess.com",
  CHEMATLAS_STUDENT_ACCESS_AUD: "student-audience",
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fixture-key", alg: "RS256", use: "sig" };
function b64(v) { return Buffer.from(JSON.stringify(v)).toString("base64url"); }
function token(overrides = {}) {
  const header = b64({ alg: "RS256", kid: "fixture-key" });
  const body = b64({
    iss: "https://chematlas-test.cloudflareaccess.com",
    aud: ["student-audience"], sub: "student-user", email: "owner@example.test",
    exp: Math.floor(now / 1000) + 600, ...overrides,
  });
  const data = `${header}.${body}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}
function request(jwt) { return new Request("https://private.example.test/questions.json", {
  headers: jwt ? { "cf-access-jwt-assertion": jwt } : {},
}); }
test("misconfiguration and missing JWT fail closed", async () => {
  assert.equal((await authenticateStudentRequest(request(), {}, now)).status, 503);
  assert.equal((await authenticateStudentRequest(request(), env, now)).status, 403);
});
test("signed correct audience and email can proceed", async () => {
  const saved = globalThis.fetch;
  clearStudentAccessKeyCacheForTests();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  try {
    assert.equal((await authenticateStudentRequest(request(token()), env, now)).ok, true);
    for (const overrides of [
      { aud: ["another-audience"] }, { iss: "https://impostor.cloudflareaccess.com" },
      { exp: Math.floor(now / 1000) - 1 }, { email: "" },
    ]) {
      assert.equal((await authenticateStudentRequest(request(token(overrides)), env, now)).ok, false);
    }
    const tampered = token().slice(0, -2) + "aa";
    assert.equal((await authenticateStudentRequest(request(tampered), env, now)).ok, false);
  } finally { globalThis.fetch = saved; clearStudentAccessKeyCacheForTests(); }
});
test("administrator and review routes are never student routes", () => {
  for (const path of ["/admin", "/admin/question-review", "/api/admin/question-review", "/%61dmin/thing"]) {
    assert.equal(isRestrictedStudentPath(path), true);
  }
  for (const path of ["/", "/api/questions", "/questions.json", "/source/bank-01.pdf"]) {
    assert.equal(isRestrictedStudentPath(path), false);
  }
});
