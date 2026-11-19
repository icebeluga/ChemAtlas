-- Review and apply explicitly. No production migration job is provided.
begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'chematlas-content' and public = false) then
    raise exception 'chematlas-content must already exist and be private';
  end if;
end $$;

create table public.approved_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.approved_users enable row level security;
alter table public.approved_users force row level security;
revoke all on public.approved_users from public, anon, authenticated;
grant select on public.approved_users to authenticated;
grant all on public.approved_users to service_role;

create policy approved_users_read_self on public.approved_users
  for select to authenticated using (user_id = (select auth.uid()));
create policy approved_users_self_guard on public.approved_users as restrictive
  for select to anon, authenticated using (user_id = (select auth.uid()));
create policy approved_users_no_insert on public.approved_users as restrictive
  for insert to anon, authenticated with check (false);
create policy approved_users_no_update on public.approved_users as restrictive
  for update to anon, authenticated using (false) with check (false);
create policy approved_users_no_delete on public.approved_users as restrictive
  for delete to anon, authenticated using (false);

-- Storage evaluates this against the current database row on each request.
-- No authorization decisions depend on editable user_metadata or JWT role flags.
create policy chematlas_shared_read on storage.objects
  for select to authenticated using (
    bucket_id = 'chematlas-content'
    and name like 'shared/releases/%'
    and exists (select 1 from public.approved_users a
      where a.user_id = (select auth.uid()) and a.revoked_at is null)
  );

-- Restrictive guards also apply when another permissive policy grants access.
-- They leave the behavior of unrelated buckets unchanged.
create policy chematlas_read_guard on storage.objects as restrictive
  for select to authenticated using (
    bucket_id <> 'chematlas-content' or (
      name like 'shared/releases/%'
      and (select auth.uid()) is not null
      and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
      and exists (select 1 from public.approved_users a
        where a.user_id = (select auth.uid()) and a.revoked_at is null)
    )
  );
create policy chematlas_anon_read_guard on storage.objects as restrictive
  for select to anon using (bucket_id <> 'chematlas-content');
create policy chematlas_no_insert on storage.objects as restrictive
  for insert to anon, authenticated with check (bucket_id <> 'chematlas-content');
create policy chematlas_no_update on storage.objects as restrictive
  for update to anon, authenticated
  using (bucket_id <> 'chematlas-content') with check (bucket_id <> 'chematlas-content');
create policy chematlas_no_delete on storage.objects as restrictive
  for delete to anon, authenticated using (bucket_id <> 'chematlas-content');

comment on table public.approved_users is
  'Owner-managed student approval by Auth UUID. Client roles cannot approve, revoke, or delete approvals.';
commit;
