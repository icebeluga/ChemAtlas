import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
import { approved, unapproved, setup } from "./fixtures/supabase-db.mjs";
await db.exec(setup);
const migration = await readFile(new URL("../supabase/migrations/202611180001_approved_student_content.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.query("insert into public.approved_users(user_id) values ($1)", [approved]);
after(() => db.close());

async function asUser(role, claims, sql, params = []) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    return await db.query(sql, params);
  } finally { await db.exec("rollback"); }
}
const readProtected = (role, claims) => asUser(role, claims, "select name from storage.objects where bucket_id = 'chematlas-content' order by name");

test("real PostgreSQL RLS denies anonymous and unapproved catalog/PDF access despite a broad existing policy", async () => {
  assert.equal((await readProtected("anon", {})).rows.length, 0);
  assert.equal((await readProtected("authenticated", { sub: unapproved })).rows.length, 0);
  assert.equal((await readProtected("authenticated", { sub: unapproved, user_metadata: { approved: true } })).rows.length, 0);
  assert.equal((await readProtected("authenticated", { sub: approved, is_anonymous: true })).rows.length, 0);
});
test("approved student can read shared catalog/PDF metadata but cannot read owner-only files", async () => {
  const { rows } = await readProtected("authenticated", { sub: approved });
  assert.deepEqual(rows.map(row => row.name), ["shared/releases/fixture/source/bank-01.pdf", "shared/releases/fixture/student-questions.json"]);
  assert.equal((await asUser("anon", {}, "select * from storage.objects where bucket_id = 'unrelated'")).rows.length, 1);
});
test("approved student cannot insert, overwrite, delete, copy into, or move protected source objects", async () => {
  const claims = { sub: approved };
  await assert.rejects(asUser("authenticated", claims, "insert into storage.objects(bucket_id,name) values ('chematlas-content','shared/releases/fixture/new.pdf')"), /row-level security/);
  assert.equal((await asUser("authenticated", claims, "update storage.objects set name='changed' where bucket_id='chematlas-content' returning id")).rows.length, 0);
  assert.equal((await asUser("authenticated", claims, "delete from storage.objects where bucket_id='chematlas-content' returning id")).rows.length, 0);
  await assert.rejects(asUser("authenticated", claims, "update storage.objects set bucket_id='chematlas-content' where bucket_id='unrelated'"), /row-level security/);
  assert.equal((await readProtected("authenticated", claims)).rows.length, 2);
});
test("students cannot approve themselves, revoke others, enumerate approvals, or delete approval rows", async () => {
  await assert.rejects(asUser("authenticated", { sub: unapproved }, "insert into public.approved_users(user_id) values ($1)", [unapproved]), /permission denied/);
  await assert.rejects(asUser("authenticated", { sub: approved }, "update public.approved_users set revoked_at=now()"), /permission denied/);
  await assert.rejects(asUser("authenticated", { sub: approved }, "delete from public.approved_users"), /permission denied/);
  await assert.rejects(asUser("anon", {}, "select * from public.approved_users"), /permission denied/);
  assert.equal((await asUser("authenticated", { sub: unapproved }, "select * from public.approved_users")).rows.length, 0);
  assert.equal((await asUser("authenticated", { sub: approved }, "select * from public.approved_users")).rows.length, 1);
});
test("revocation takes effect for an unchanged existing JWT", async () => {
  await db.query("update public.approved_users set revoked_at=now() where user_id=$1", [approved]);
  assert.equal((await readProtected("authenticated", { sub: approved })).rows.length, 0);
  await db.query("update public.approved_users set revoked_at=null where user_id=$1", [approved]);
});
test("migration fails closed when the existing bucket is public", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(setup);
    await isolated.exec("update storage.buckets set public=true where id='chematlas-content'");
    await assert.rejects(isolated.exec(migration), /must already exist and be private/);
    await isolated.exec("rollback");
    assert.equal((await isolated.query("select to_regclass('public.approved_users') as name")).rows[0].name, null);
  } finally { await isolated.close(); }
});
