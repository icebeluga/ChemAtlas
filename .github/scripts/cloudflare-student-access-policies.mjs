import assert from "node:assert/strict";

// Identifiers from the reviewed production application and its reusable Service Auth policy.
const productionAppId = "b19642a6-b44f-42b6-8d99-4ec6e22daf9f";
const servicePolicyId = "4e5fff80-cd83-483d-8ec3-af3feca0aa0d";
const serviceTokenIds = new Set([
  "6d2fea3c-109d-41ca-a444-f6c8dee88687",
  "aad33164-a278-448e-8d02-1174ccf5caac",
]);

function hasNoRules(rules) {
  return rules == null || (Array.isArray(rules) && rules.length === 0);
}

function isReviewedServicePolicy(policy, applicationId, coverage) {
  if (applicationId !== productionAppId || coverage !== "Worker-level" || policy.id !== servicePolicyId
    || !hasNoRules(policy.require) || !hasNoRules(policy.exclude)
    || !Array.isArray(policy.include) || policy.include.length !== serviceTokenIds.size) return false;

  const tokenIds = new Set();
  for (const rule of policy.include) {
    if (!rule || Object.keys(rule).length !== 1 || !rule.service_token
      || Object.keys(rule.service_token).length !== 1) return false;
    tokenIds.add(rule.service_token.token_id);
  }
  return tokenIds.size === serviceTokenIds.size && [...tokenIds].every(id => serviceTokenIds.has(id));
}

export function validateStudentAccessPolicies(policies, { applicationId, coverage }) {
  assert.ok(Array.isArray(policies) && policies.length > 0
    && policies.every(policy => ["allow", "deny", "non_identity"].includes(policy?.decision)),
  "Student Access policy contains a bypass or an unsupported decision.");

  const service = policies.filter(({ decision }) => decision === "non_identity");
  assert.ok(service.length === 0
    || (service.length === 1 && isReviewedServicePolicy(service[0], applicationId, coverage)),
  "Student Service Auth differs from the reviewed production policy or token IDs.");

  const allow = policies.filter(({ decision }) => decision === "allow");
  assert.ok(allow.length > 0 && allow.every(({ include }) => Array.isArray(include) && include.length > 0
    && include.every((rule) => rule && Object.keys(rule).length === 1
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rule.email?.email ?? ""))),
  "Could not verify a student email allowlist.");
}
