import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSupabaseConfig, protectedObjectPath } from "../lib/supabase-config.mjs";
const prefix = "shared/releases/fixture";
const key = "sb_publishable_localfixture";
test("browser configuration rejects privileged keys and unsafe origins/prefixes", () => {
  assert.equal(validateSupabaseConfig("https://example.supabase.co", key, prefix).url, "https://example.supabase.co");
  for (const value of ["sb_secret_do_not_use", "eyJhbGciOiJIUzI1NiJ9", "", undefined]) {
    assert.throws(() => validateSupabaseConfig("https://example.supabase.co", value, prefix));
  }
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?key=x"]) {
    assert.throws(() => validateSupabaseConfig(url, key, prefix));
  }
  assert.throws(() => validateSupabaseConfig("https://example.supabase.co", key, "../private"));
});
test("protected URLs cannot send the student token to arbitrary hosts or paths", () => {
  assert.equal(protectedObjectPath("/source/bank-01.pdf", prefix), `${prefix}/source/bank-01.pdf`);
  for (const path of ["https://attacker.invalid/a.pdf", "//attacker.invalid/a.pdf", "/../private.pdf", "/source/%2e%2e/private.pdf", "/source/bank-01.pdf?x=1", "/admin/backup.json"]) {
    assert.throws(() => protectedObjectPath(path, prefix));
  }
});
