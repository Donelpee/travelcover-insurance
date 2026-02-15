-- Replace send_email_via_resend with a version that does NOT depend on http_request type
-- Run in Supabase SQL Editor

create extension if not exists http with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Drop existing overloads so return type/signature changes do not fail
DO $$
declare
  fn record;
begin
  for fn in
    select oidvectortypes(p.proargtypes) as arg_types
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'send_email_via_resend'
  loop
    execute format('drop function if exists public.send_email_via_resend(%s);', fn.arg_types);
  end loop;
end;
$$;

create or replace function public.send_email_via_resend(
  to_email text,
  email_subject text,
  email_html text,
  passenger_id_param uuid default null,
  recipient_type_param text default 'passenger'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resend_api_key text;
  from_email text;
  endpoint text := 'https://api.resend.com/emails';
  payload jsonb;
  headers jsonb;
  http_response extensions.http_response;
  response_json jsonb := '{}'::jsonb;
  raw_collect jsonb := '{}'::jsonb;
  response_body_text text;
  request_id bigint;
  status_code integer;
  is_success boolean := false;
  err_text text;
begin
  -- Preferred: Vault secret
  select ds.decrypted_secret into resend_api_key
  from vault.decrypted_secrets ds
  where ds.name = 'resend_api_key'
  order by ds.created_at desc
  limit 1;

  -- Backward-compatible fallback: settings table
  if resend_api_key is null or btrim(resend_api_key) = '' then
    select setting_value into resend_api_key
    from public.sms_settings
    where setting_key = 'resend_api_key'
    limit 1;
  end if;

  -- From address (configurable)
  select setting_value into from_email
  from public.sms_settings
  where setting_key in ('resend_from_email', 'email_from_address')
  order by case when setting_key = 'resend_from_email' then 0 else 1 end
  limit 1;

  if from_email is null or btrim(from_email) = '' then
    from_email := 'noreply@travelcover.com.ng';
  end if;

  if resend_api_key is null or btrim(resend_api_key) = '' then
    err_text := 'Missing resend_api_key (vault or sms_settings)';

    begin
      insert into public.email_logs (
        passenger_id,
        recipient_type,
        email_address,
        status,
        sent_at,
        error_message
      ) values (
        passenger_id_param,
        recipient_type_param,
        to_email,
        'failed',
        now(),
        err_text
      );
    exception when others then
      null;
    end;

    return jsonb_build_object('success', false, 'message', err_text);
  end if;

  payload := jsonb_build_object(
    'from', from_email,
    'to', jsonb_build_array(to_email),
    'subject', coalesce(email_subject, 'Journey Update'),
    'html', coalesce(email_html, '<p>Journey update</p>')
  );

  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || resend_api_key
  );

  begin
    -- Backend compatibility:
    -- 1) extensions.http_post(text,text,text,jsonb)
    -- 2) http_post(text,text,text,jsonb)
    -- 3) net.http_post(...) + net.http_collect_response(...)
    if to_regprocedure('extensions.http_post(text,text,text,jsonb)') is not null then
      execute 'select * from extensions.http_post($1,$2,$3,$4)'
      into http_response
      using endpoint, payload::text, 'application/json', headers;

      if http_response.status between 200 and 299 then
        response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);
        is_success := true;
      else
        is_success := false;
        response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);
        err_text := format('HTTP %s: %s', http_response.status, coalesce(http_response.content, 'No response body'));
      end if;
    elsif to_regprocedure('http_post(text,text,text,jsonb)') is not null then
      execute 'select * from http_post($1,$2,$3,$4)'
      into http_response
      using endpoint, payload::text, 'application/json', headers;

      if http_response.status between 200 and 299 then
        response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);
        is_success := true;
      else
        is_success := false;
        response_json := coalesce(nullif(http_response.content, '')::jsonb, '{}'::jsonb);
        err_text := format('HTTP %s: %s', http_response.status, coalesce(http_response.content, 'No response body'));
      end if;
    elsif to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null
       and to_regprocedure('net.http_collect_response(bigint,boolean)') is not null then
      execute 'select net.http_post($1,$2,$3,$4,$5)'
      into request_id
      using endpoint, payload, '{}'::jsonb, headers, 10000;

      perform pg_sleep(1);

      execute 'select row_to_json(r)::jsonb from net.http_collect_response($1, true) r'
      into raw_collect
      using request_id;

      status_code := coalesce((raw_collect->>'status_code')::integer, (raw_collect->>'status')::integer, 0);
      response_body_text := coalesce(raw_collect->>'body', raw_collect->>'content', '{}');

      begin
        response_json := coalesce(nullif(response_body_text, '')::jsonb, '{}'::jsonb);
      exception
        when others then
          response_json := jsonb_build_object('raw_body', response_body_text);
      end;

      if status_code between 200 and 299 then
        is_success := true;
      else
        is_success := false;
        err_text := format('HTTP %s: %s', status_code, coalesce(response_body_text, 'No response body'));
      end if;
    else
      is_success := false;
      err_text := 'No supported HTTP backend found for Resend call';
      response_json := '{}'::jsonb;
    end if;
  exception
    when others then
      is_success := false;
      err_text := sqlerrm;
      response_json := '{}'::jsonb;
  end;

  begin
    insert into public.email_logs (
      passenger_id,
      recipient_type,
      email_address,
      status,
      sent_at,
      error_message
    ) values (
      passenger_id_param,
      recipient_type_param,
      to_email,
      case when is_success then 'sent' else 'failed' end,
      now(),
      case when is_success then null else coalesce(err_text, response_json->>'message', response_json->>'error') end
    );
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'success', is_success,
    'email_id', response_json->>'id',
    'message', case when is_success then 'Email sent' else coalesce(err_text, response_json->>'message', response_json->>'error', 'Email failed') end,
    'raw', response_json
  );
end;
$$;

grant execute on function public.send_email_via_resend(text, text, text, uuid, text) to anon, authenticated, service_role;
