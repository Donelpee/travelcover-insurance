-- Secure app_users access for a real authenticated admin flow.
-- Run this after enable_app_users_rls.sql.
--
-- What this does:
-- 1. Links app_users rows to Supabase Auth users through auth_user_id.
-- 2. Backfills that link for any existing rows whose email matches auth.users.
-- 3. Exposes a safe RPC for the signed-in user to read their own profile.
-- 4. Leaves all admin CRUD to a server-side Edge Function using service_role.

do $$
begin
  if to_regclass('public.app_users') is null then
    raise exception 'Table public.app_users does not exist in this database.';
  end if;
end;
$$;

alter table public.app_users
  add column if not exists auth_user_id uuid;

create index if not exists app_users_auth_user_id_idx
  on public.app_users (auth_user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_auth_user_id_key'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_auth_user_id_key unique (auth_user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_auth_user_id_fkey'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users (id)
      on delete set null;
  end if;
end;
$$;

update public.app_users as au
set auth_user_id = auth_users.id
from auth.users as auth_users
where au.auth_user_id is null
  and auth_users.email is not null
  and lower(auth_users.email) = lower(au.email);

create or replace function public.get_current_app_user_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text := lower(nullif(auth.jwt()->>'email', ''));
  v_result jsonb;
begin
  if v_auth_user_id is null and v_email is null then
    return null;
  end if;

  if v_auth_user_id is not null and v_email is not null then
    update public.app_users
    set auth_user_id = v_auth_user_id
    where auth_user_id is null
      and lower(email) = v_email;
  end if;

  select jsonb_build_object(
    'id', au.id,
    'auth_user_id', au.auth_user_id,
    'full_name', au.full_name,
    'email', au.email,
    'role', au.role,
    'is_active', coalesce(au.is_active, true),
    'permissions', coalesce(
      jsonb_agg(distinct p.permission_key) filter (where p.permission_key is not null),
      '[]'::jsonb
    )
  )
  into v_result
  from public.app_users as au
  left join public.roles as r
    on r.role_name = au.role
  left join public.role_permissions as rp
    on rp.role_id = r.id
  left join public.permissions as p
    on p.id = rp.permission_id
  where (
      v_auth_user_id is not null
      and au.auth_user_id = v_auth_user_id
    ) or (
      v_email is not null
      and lower(au.email) = v_email
    )
  group by
    au.id,
    au.auth_user_id,
    au.full_name,
    au.email,
    au.role,
    au.is_active,
    au.created_at
  order by
    case
      when v_auth_user_id is not null and au.auth_user_id = v_auth_user_id then 0
      else 1
    end,
    au.created_at desc nulls last
  limit 1;

  if v_result is null then
    return null;
  end if;

  if coalesce((v_result->>'is_active')::boolean, true) = false then
    return null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_current_app_user_profile() from public;
revoke all on function public.get_current_app_user_profile() from anon;
grant execute on function public.get_current_app_user_profile() to authenticated, service_role;

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_users'
  and column_name = 'auth_user_id';

select
  id,
  email,
  auth_user_id
from public.app_users
order by created_at desc nulls last
limit 10;
