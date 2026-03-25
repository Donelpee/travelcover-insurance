-- Harden public.app_users in Supabase.
-- Run this in the Supabase SQL Editor for the target project database.
--
-- Why this is intentionally strict:
-- The current frontend accesses public.app_users directly with the anon key.
-- Leaving that access open is what triggered the Supabase security warning.
-- This script fixes the warning by enabling and forcing RLS, and by removing
-- direct anon/authenticated table grants. Add explicit least-privilege
-- policies later when the app has a trusted auth or backend flow.

do $$
begin
  if to_regclass('public.app_users') is null then
    raise exception 'Table public.app_users does not exist in this database.';
  end if;
end;
$$;

revoke all on table public.app_users from public;
revoke all on table public.app_users from anon;
revoke all on table public.app_users from authenticated;

grant select, insert, update, delete, references, trigger, truncate
on table public.app_users
to service_role;

alter table public.app_users enable row level security;
alter table public.app_users force row level security;

comment on table public.app_users is
  'RLS enforced on 2026-03-25. Direct anon/authenticated access removed; use service_role or add explicit least-privilege RLS policies.';

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'app_users';

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'app_users'
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by grantee, privilege_type;
