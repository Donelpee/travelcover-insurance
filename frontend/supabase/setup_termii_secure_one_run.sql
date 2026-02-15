-- One-run secure Termii setup (function + vault key + sender + smoke test)
-- Use in one SQL Editor tab/session.
-- Step 1: run this first line with your real key, then run the rest of this file.
-- select set_config('app.termii_api_key', 'YOUR_REAL_TERMII_API_KEY', false);

create extension if not exists http with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Ensure key exists in session and persist to Vault
DO $$
declare
  v_termii_key text := nullif(current_setting('app.termii_api_key', true), '');
begin
  if v_termii_key is not null then
    delete from vault.secrets where name = 'termii_api_key';
    perform vault.create_secret(v_termii_key, 'termii_api_key', 'Termii API key for SMS');
  elsif not exists (select 1 from vault.decrypted_secrets where name = 'termii_api_key') then
    raise exception 'Missing API key for first-time setup. Set app.termii_api_key in this SQL session first.';
  end if;
end;
$$;

-- Drop existing overloads
DO $$
declare
  fn record;
begin
  for fn in
    select oidvectortypes(p.proargtypes) as arg_types
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'send_sms_via_termii'
  loop
    execute format('drop function if exists public.send_sms_via_termii(%s);', fn.arg_types);
  end loop;
end;
$$;

-- Recreate secure function (Vault only)
create or replace function public.send_sms_via_termii(
  phone_number text,
  message_text text,
  passenger_id_param uuid default null,
  recipient_type_param text default 'passenger'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  termii_api_key text;
  termii_sender_id text;
  termii_channel text;
  used_channel text;
  termii_url text := 'https://api.ng.termii.com/api/sms/send';
  normalized_phone text;
  request_payload jsonb;
  http_response extensions.http_response;
  response_json jsonb;
  is_success boolean := false;
  error_message text;
begin
  select ds.decrypted_secret into termii_api_key
  from vault.decrypted_secrets ds
  where ds.name = 'termii_api_key'
  order by ds.created_at desc
  limit 1;

  select setting_value into termii_sender_id
  from public.sms_settings
  where setting_key = 'sender_id'
  limit 1;

  select setting_value into termii_channel
  from public.sms_settings
  where setting_key = 'termii_channel'
  limit 1;

  if termii_api_key is null or btrim(termii_api_key) = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Missing termii_api_key in vault.decrypted_secrets',
      'version', 'vault-secure-v1'
    );
  end if;

  if termii_sender_id is null or btrim(termii_sender_id) = '' then
    termii_sender_id := 'Travelcover';
  end if;

  if termii_channel is null or btrim(termii_channel) = '' then
    termii_channel := 'generic';
  end if;

  normalized_phone := btrim(coalesce(phone_number, ''));

  if normalized_phone = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Phone number is empty',
      'version', 'vault-secure-v1'
    );
  end if;

  if left(normalized_phone, 1) = '0' then
    normalized_phone := '+234' || right(normalized_phone, length(normalized_phone) - 1);
  elsif left(normalized_phone, 1) <> '+' then
    normalized_phone := '+234' || normalized_phone;
  end if;

  used_channel := termii_channel;
  begin
    request_payload := jsonb_build_object(
      'to', normalized_phone,
      'from', termii_sender_id,
      'sms', message_text,
      'type', 'plain',
      'channel', used_channel,
      'api_key', termii_api_key
    );

    select *
    into http_response
    from extensions.http_post(
      termii_url,
      request_payload::text,
      'application/json'
    );

    if http_response.status between 200 and 299 then
      response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);

      if coalesce(response_json->>'message_id', '') <> ''
         or coalesce(lower(response_json->>'code'), '') in ('ok', 'success')
         or coalesce(lower(response_json->>'status'), '') in ('ok', 'success') then
        is_success := true;
      else
        is_success := coalesce(response_json->>'error', '') = '';
      end if;

      error_message := response_json->>'error';
    else
      is_success := false;
      error_message := format('HTTP %s: %s', http_response.status, coalesce(http_response.content, 'No response body'));
      response_json := '{}'::jsonb;
    end if;
  exception
    when others then
      is_success := false;
      error_message := sqlerrm;
      response_json := '{}'::jsonb;
  end;

  -- Fallback for Termii route issues on generic channel
  if (not is_success)
     and coalesce(error_message, '') ilike '%No Route%'
     and used_channel <> 'dnd' then
    used_channel := 'dnd';

    begin
      request_payload := jsonb_build_object(
        'to', normalized_phone,
        'from', termii_sender_id,
        'sms', message_text,
        'type', 'plain',
        'channel', used_channel,
        'api_key', termii_api_key
      );

      select *
      into http_response
      from extensions.http_post(
        termii_url,
        request_payload::text,
        'application/json'
      );

      if http_response.status between 200 and 299 then
        response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);

        if coalesce(response_json->>'message_id', '') <> ''
           or coalesce(lower(response_json->>'code'), '') in ('ok', 'success')
           or coalesce(lower(response_json->>'status'), '') in ('ok', 'success') then
          is_success := true;
        else
          is_success := coalesce(response_json->>'error', '') = '';
        end if;

        error_message := response_json->>'error';
      else
        is_success := false;
        error_message := format('HTTP %s: %s', http_response.status, coalesce(http_response.content, 'No response body'));
        response_json := '{}'::jsonb;
      end if;
    exception
      when others then
        is_success := false;
        error_message := sqlerrm;
        response_json := '{}'::jsonb;
    end;
  end if;

  begin
    insert into public.sms_logs (
      passenger_id,
      recipient_type,
      phone_number,
      message_content,
      status,
      error_message,
      sent_at,
      provider
    )
    values (
      passenger_id_param,
      recipient_type_param,
      normalized_phone,
      message_text,
      case when is_success then 'sent' else 'failed' end,
      case when is_success then null else error_message end,
      now(),
      'termii'
    );
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'success', is_success,
    'phone', normalized_phone,
    'provider', 'termii',
    'channel', used_channel,
    'version', 'vault-secure-v1',
    'message_id', response_json->>'message_id',
    'message', coalesce(response_json->>'message', case when is_success then 'SMS sent' else 'SMS failed' end),
    'error', case when is_success then null else error_message end,
    'raw', response_json
  );
end;
$$;

-- Harden execute privileges
revoke all on function public.send_sms_via_termii(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.send_sms_via_termii(text, text, uuid, text) to service_role;

-- Keep non-secret sender only
insert into public.sms_settings (setting_key, setting_value)
values
  ('sender_id', 'Travelcover'),
  ('termii_channel', 'generic')
on conflict (setting_key)
do update set setting_value = excluded.setting_value;

delete from public.sms_settings where setting_key = 'termii_api_key';

-- Verification
select
  case when exists (select 1 from vault.decrypted_secrets where name = 'termii_api_key') then 'vault key present' else 'vault key missing' end as vault_status,
  coalesce((select setting_value from public.sms_settings where setting_key = 'sender_id' limit 1), '(missing)') as sender_id;

-- Smoke test (if this fails with permission denied, test via process_due_scheduled_jobs instead)
select public.send_sms_via_termii(
  '+2348012345678',
  'Test SMS from Travel Insurance App',
  null,
  'passenger'
) as sms_test_result;
