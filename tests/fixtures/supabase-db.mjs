export const approved = "00000000-0000-4000-8000-000000000001";
export const unapproved = "00000000-0000-4000-8000-000000000002";
export const setup = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  create table auth.users(id uuid primary key);
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  create table storage.buckets(id text primary key, public boolean not null);
  create table storage.objects(id int generated always as identity primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant usage on sequence storage.objects_id_seq to anon, authenticated;
  -- Deliberately broad existing policy must not bypass the new bucket guards.
  create policy existing_broad_policy on storage.objects for all to anon, authenticated using(true) with check(true);
  insert into auth.users values ('${approved}'), ('${unapproved}');
  insert into storage.buckets values ('chematlas-content', false), ('unrelated', false);
  insert into storage.objects(bucket_id, name) values
    ('chematlas-content', 'shared/releases/fixture/student-questions.json'),
    ('chematlas-content', 'shared/releases/fixture/source/bank-01.pdf'),
    ('chematlas-content', 'owner-only/private.pdf'),
    ('unrelated', 'existing.txt');
`;
