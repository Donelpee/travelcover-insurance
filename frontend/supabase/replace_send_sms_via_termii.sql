-- Replace send_sms_via_termii with a secure version that uses extensions.http_post
-- Run this in Supabase SQL Editor

create extension if not exists http with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Drop existing overloads first so return type/signature changes don't fail
do $$
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
  termii_url text := 'https://api.ng.termii.com/api/sms/send';
  normalized_phone text;
  request_payload jsonb;
  http_response extensions.http_response;
  response_json jsonb;
  is_success boolean := false;
  error_message text;
begin
  -- Load Termii API key from Supabase Vault (secret name: termii_api_key)
  select ds.decrypted_secret into termii_api_key
  from vault.decrypted_secrets ds
  where ds.name = 'termii_api_key'
  order by ds.created_at desc
  limit 1;

  select setting_value into termii_sender_id
  from public.sms_settings
  where setting_key = 'sender_id'
  limit 1;

  if termii_api_key is null or btrim(termii_api_key) = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Missing termii_api_key in vault.decrypted_secrets'
    );
  end if;

  if termii_sender_id is null or btrim(termii_sender_id) = '' then
    termii_sender_id := 'TravelCover';
  end if;

  normalized_phone := btrim(coalesce(phone_number, ''));

  if normalized_phone = '' then
    return jsonb_build_object(
      'success', false,
      'error', 'Phone number is empty'
    );
  end if;

  -- Normalize Nigerian numbers to +234...
  if left(normalized_phone, 1) = '0' then
    normalized_phone := '+234' || right(normalized_phone, length(normalized_phone) - 1);
  elsif left(normalized_phone, 1) <> '+' then
    normalized_phone := '+234' || normalized_phone;
  end if;

  request_payload := jsonb_build_object(
    'to', normalized_phone,
    'from', termii_sender_id,
    'sms', message_text,
    'type', 'plain',
    'channel', 'generic',
    'api_key', termii_api_key
  );

  begin
    select *
    into http_response
    from extensions.http_post(
      termii_url,
      request_payload::text,
      'application/json'
    );

    if http_response.status between 200 and 299 then
      response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);

      -- Termii usually returns a message_id or code/success-like payload on success
      if coalesce(response_json->>'message_id', '') <> ''
         or coalesce(lower(response_json->>'code'), '') in ('ok', 'success')
         or coalesce(lower(response_json->>'status'), '') in ('ok', 'success') then
        is_success := true;
      else
        -- If HTTP is successful but provider payload is unclear, treat as success unless explicit error exists
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

  -- Log outcome to sms_logs (best effort)
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
      -- Do not fail SMS RPC because of log insert issues
      null;
  end;

  return jsonb_build_object(
    'success', is_success,
    'phone', normalized_phone,
    'provider', 'termii',
    'message_id', response_json->>'message_id',
    'message', coalesce(response_json->>'message', case when is_success then 'SMS sent' else 'SMS failed' end),
    'error', case when is_success then null else error_message end,
    'raw', response_json
  );
end;
$$;

revoke all on function public.send_sms_via_termii(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.send_sms_via_termii(text, text, uuid, text) to service_role;
