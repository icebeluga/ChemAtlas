import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStudentAccessPolicies } from "../.github/scripts/cloudflare-student-access-policies.mjs";

const production = {
  applicationId: "b19642a6-b44f-42b6-8d99-4ec6e22daf9f",
  coverage: "Worker-level",
};
const human = {
  decision: "allow",
  include: [{ email: { email: "student@example.invalid" } }],
};
const service = {
  id: "4e5fff80-cd83-483d-8ec3-af3feca0aa0d",
  name: "\tChemAtlas-AI-Service-Access",
  decision: "non_identity",
  include: [
    { service_token: { token_id: "6d2fea3c-109d-41ca-a444-f6c8dee88687" } },
    { service_token: { token_id: "aad33164-a278-448e-8d02-1174ccf5caac" } },
  ],
  require: [],
  exclude: [],
};

test("accepts a human-only allowlist and the exact production Service Auth policy", () => {
  validateStudentAccessPolicies([human, { decision: "deny" }], production);
  validateStudentAccessPolicies([human, service], production);
  validateStudentAccessPolicies([{ ...service, include: [...service.include].reverse() }, human], production);
});

test("rejects Service Auth outside the pinned Worker-level application", () => {
  for (const selection of [
    { ...production, applicationId: "another-application" },
    { ...production, coverage: "account-wide" },
    { ...production, coverage: "hostname-based" },
  ]) {
    assert.throws(() => validateStudentAccessPolicies([human, service], selection), /reviewed production policy/);
  }
});

test("rejects an unreviewed policy, a second Service Auth policy and bypass decisions", () => {
  assert.throws(() => validateStudentAccessPolicies([human, { ...service, id: "another-policy" }], production),
    /reviewed production policy/);
  assert.throws(() => validateStudentAccessPolicies([human, service, service], production), /reviewed production policy/);
  for (const decision of ["bypass", "service_auth", "unknown"]) {
    assert.throws(() => validateStudentAccessPolicies([human, service, { decision }], production),
      /bypass or an unsupported decision/);
  }
});

test("rejects missing, duplicate, substituted, additional and broad token selectors", () => {
  const [first, second] = service.include;
  const unknown = { service_token: { token_id: "unknown-token" } };
  for (const include of [
    [first], [first, first], [first, unknown], [first, second, unknown],
    [first, { any_valid_service_token: {} }],
    [first, { service_token_tag: { key: "access", value: "students" } }],
    [first, { ...second, everyone: {} }],
    [first, { service_token: { ...second.service_token, extra: true } }],
  ]) {
    assert.throws(() => validateStudentAccessPolicies([human, { ...service, include }], production),
      /reviewed production policy/);
  }
});

test("rejects additional service conditions and still requires an individual human email allowlist", () => {
  for (const key of ["require", "exclude"]) {
    assert.throws(() => validateStudentAccessPolicies([human, { ...service, [key]: [{ everyone: {} }] }], production),
      /reviewed production policy/);
  }
  assert.throws(() => validateStudentAccessPolicies([service], production), /student email allowlist/);
  for (const include of [
    [],
    [{ email_domain: { domain: "example.invalid" } }],
    [{ group: { id: "shared-group" } }],
    [{ email: { email: "invalid-email" } }],
    [{ email: { email: "student@example.invalid" }, everyone: {} }],
  ]) {
    assert.throws(() => validateStudentAccessPolicies([{ ...human, include }, service], production),
      /student email allowlist/);
  }
  assert.throws(() => validateStudentAccessPolicies([human, { ...human, include: [] }, service], production),
    /student email allowlist/);
});
