-- Configure secure SMS settings for send_sms_via_termii
-- Run this in Supabase SQL Editor.
-- IMPORTANT: Do not place live API keys in this file.
-- Before running, execute (same SQL tab/session):
--   select set_config('app.termii_api_key', 'YOUR_REAL_TERMII_API_KEY', false);

create extension if not exists supabase_vault with schema vault;

do $$
declare
  v_termii_key text := nullif(current_setting('app.termii_api_key', true), '');
begin
  if v_termii_key is null then
    raise exception 'Missing app.termii_api_key session value. Run: select set_config(''app.termii_api_key'', ''YOUR_REAL_TERMII_API_KEY'', false);';
  end if;

  -- Replace existing secret deterministically
  delete from vault.secrets where name = 'termii_api_key';
  perform vault.create_secret(v_termii_key, 'termii_api_key', 'Termii API key for SMS');
end;
$$;

-- 1) Store sender id (non-secret) in sms_settings
insert into public.sms_settings (setting_key, setting_value)
values ('sender_id', 'TravelCover')
on conflict (setting_key)
do update set setting_value = excluded.setting_value;

-- 2) API key is stored as Vault secret above (never in sms_settings)

-- 3) Remove any legacy plaintext key from sms_settings
delete from public.sms_settings where setting_key = 'termii_api_key';

-- 4) Verify secure configuration
select
  'sender_id' as config,
  coalesce((select setting_value from public.sms_settings where setting_key = 'sender_id' limit 1), '(missing)') as value
union all
select
  'termii_api_key_secret',
  case when exists (select 1 from vault.decrypted_secrets where name = 'termii_api_key') then 'present' else '(missing)' end;

-- 5) Smoke test (replace phone number)
select public.send_sms_via_termii(
  '+2348012345678',
  'Test SMS from Travel Insurance App',
  null,
  'passenger'
) as sms_test_result;
