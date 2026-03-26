-- Enable RLS on public admin-console tables and restrict access to
-- authenticated app admins only.
--
-- Run this after:
-- 1. enable_app_users_rls.sql
-- 2. secure_app_users_access.sql
--
-- This script is designed to clear the Supabase advisory-center RLS errors
-- for the listed public tables without breaking the signed-in admin app.

create or replace function public.is_current_app_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := lower(nullif(auth.jwt()->>'email', ''));
begin
  if v_auth_user_id is null and v_email is null then
    return false;
  end if;

  return exists (
    select 1
    from public.app_users
    where coalesce(is_active, true) = true
      and lower(role) in ('admin', 'super_admin')
      and (
        (v_auth_user_id is not null and auth_user_id = v_auth_user_id)
        or (v_email is not null and lower(email) = v_email)
      )
  );
end;
$$;

revoke all on function public.is_current_app_admin() from public;
revoke all on function public.is_current_app_admin() from anon;
grant execute on function public.is_current_app_admin() to authenticated, service_role;

do $$
declare
  table_name text;
  policy_name text := 'authenticated_admin_access';
  target_tables text[] := array[
    'transport_companies',
    'routes',
    'passengers',
    'manifests',
    'sms_logs',
    'sms_templates',
    'sms_settings',
    'roles',
    'role_permissions',
    'permissions',
    'scheduled_emails',
    'email_templates',
    'sms_schedule_rules',
    'scheduled_sms',
    'automation_rules',
    'scheduled_jobs'
  ];
begin
  foreach table_name in array target_tables
  loop
    execute format('alter table public.%I enable row level security;', table_name);

    execute format('revoke all on table public.%I from public;', table_name);
    execute format('revoke all on table public.%I from anon;', table_name);
    execute format('revoke all on table public.%I from authenticated;', table_name);

    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated;',
      table_name
    );

    execute format(
      'grant select, insert, update, delete, references, trigger, truncate on table public.%I to service_role;',
      table_name
    );

    execute format(
      'drop policy if exists %I on public.%I;',
      policy_name,
      table_name
    );

    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_current_app_admin()) with check (public.is_current_app_admin());',
      policy_name,
      table_name
    );
  end loop;
end;
$$;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'transport_companies',
    'routes',
    'passengers',
    'manifests',
    'sms_logs',
    'sms_templates',
    'sms_settings',
    'roles',
    'role_permissions',
    'permissions',
    'scheduled_emails',
    'email_templates',
    'sms_schedule_rules',
    'scheduled_sms',
    'automation_rules',
    'scheduled_jobs'
  )
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'transport_companies',
    'routes',
    'passengers',
    'manifests',
    'sms_logs',
    'sms_templates',
    'sms_settings',
    'roles',
    'role_permissions',
    'permissions',
    'scheduled_emails',
    'email_templates',
    'sms_schedule_rules',
    'scheduled_sms',
    'automation_rules',
    'scheduled_jobs'
  )
order by tablename, policyname;
