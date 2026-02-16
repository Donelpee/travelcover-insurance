-- Journey Automation: automatic scheduled job processor
-- Run this in Supabase SQL Editor (project database)

create extension if not exists pg_cron;

create or replace function public.process_due_scheduled_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  scheduled_record record;
  sms_result jsonb;
  email_result jsonb;
  recipient_email text;
  passenger_name text;
  next_of_kin_name text;
  manifest_reference text;
  company_name text;
  departure_location text;
  destination_location text;
  trip_date_text text;
  support_phone text;
  template_subject text;
  template_body text;
  rendered_subject text;
  rendered_body text;
  email_subject text;
  email_body text;
  processed_count integer := 0;
  sent_count integer := 0;
  failed_count integer := 0;
  email_sent_count integer := 0;
  email_failed_count integer := 0;
begin
  select setting_value
  into support_phone
  from public.sms_settings
  where setting_key = 'emergency_contact'
  limit 1;

  if support_phone is null or btrim(support_phone) = '' then
    support_phone := '+234 800 000 0000';
  end if;

  for scheduled_record in
    select id, passenger_id, recipient_type, phone_number, message_content, message_type
    from public.scheduled_jobs
    where status = 'pending'
      and scheduled_time <= now()
    order by scheduled_time asc
    for update skip locked
  loop
    processed_count := processed_count + 1;

    begin
      -- Uses your existing RPC integration that sends SMS and writes provider logs
      select public.send_sms_via_termii(
        phone_number := scheduled_record.phone_number,
        message_text := scheduled_record.message_content,
        passenger_id_param := scheduled_record.passenger_id,
        recipient_type_param := scheduled_record.recipient_type
      ) into sms_result;

      if coalesce((sms_result->>'success')::boolean, false) then
        begin
          update public.scheduled_jobs
          set status = 'sent',
              executed_at = now(),
              error_message = null
          where id = scheduled_record.id;
        exception
          when check_violation then
            -- Some deployments enforce a status constraint that does not allow 'sent'.
            -- Remove processed row so it is not retried and rely on sms_logs/email_logs for history.
            delete from public.scheduled_jobs where id = scheduled_record.id;
        end;

        sent_count := sent_count + 1;

        -- Send scheduled email counterpart when recipient email exists
        select
          case
            when scheduled_record.recipient_type = 'next_of_kin' then p.next_of_kin_email
            else p.email
          end,
          p.full_name,
          p.next_of_kin_name,
          m.manifest_reference,
          tc.company_name,
          r.departure_location,
          r.destination,
          to_char(m.trip_date::date, 'FMDay, FMMonth DD, YYYY')
        into recipient_email,
             passenger_name,
             next_of_kin_name,
             manifest_reference,
             company_name,
             departure_location,
             destination_location,
             trip_date_text
        from public.passengers p
        left join public.manifests m on m.id = p.manifest_id
        left join public.transport_companies tc on tc.id = m.company_id
        left join public.routes r on r.id = m.route_id
        where p.id = scheduled_record.passenger_id;

        if recipient_email is not null and btrim(recipient_email) <> '' then
          email_subject := case
            when scheduled_record.message_type = 'arrival_30min' then 'Journey Arrival Update'
            else 'Journey Departure Update'
          end;

          select et.subject, et.body_html
          into template_subject, template_body
          from public.email_templates et
          where et.is_active = true
            and et.template_type in (
              case
                when scheduled_record.recipient_type = 'next_of_kin' then 'next_of_kin'
                else 'passenger'
              end,
              'general'
            )
          order by
            case
              when et.template_type = case
                when scheduled_record.recipient_type = 'next_of_kin' then 'next_of_kin'
                else 'passenger'
              end then 0
              when et.template_type = 'general' then 1
              else 2
            end,
            et.updated_at desc nulls last,
            et.created_at desc nulls last
          limit 1;

          rendered_subject := coalesce(template_subject, email_subject);
          rendered_body := coalesce(
            template_body,
            '<p>' || coalesce(scheduled_record.message_content, '') || '</p>' ||
            '<p><strong>Reference:</strong> ' || coalesce(manifest_reference, 'N/A') || '</p>' ||
            '<p><strong>Support:</strong> ' || support_phone || '</p>'
          );

          rendered_subject := replace(rendered_subject, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_subject := replace(rendered_subject, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_subject := replace(rendered_subject, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_subject := replace(rendered_subject, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_subject := replace(rendered_subject, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_subject := replace(rendered_subject, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_subject := replace(rendered_subject, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_subject := replace(rendered_subject, '{support_phone}', support_phone);

          rendered_body := replace(rendered_body, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_body := replace(rendered_body, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_body := replace(rendered_body, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_body := replace(rendered_body, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_body := replace(rendered_body, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_body := replace(rendered_body, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_body := replace(rendered_body, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_body := replace(rendered_body, '{support_phone}', support_phone);

          begin
            select public.send_email_via_resend(
              to_email := recipient_email,
              email_subject := rendered_subject,
              email_html := rendered_body,
              passenger_id_param := scheduled_record.passenger_id,
              recipient_type_param := scheduled_record.recipient_type
            ) into email_result;

            if not coalesce((email_result->>'success')::boolean, false)
               and coalesce(email_result->>'message', email_result->>'error', '') ilike '%Failed to fetch%'
            then
              perform pg_sleep(1);
              select public.send_email_via_resend(
                to_email := recipient_email,
                email_subject := rendered_subject,
                email_html := rendered_body,
                passenger_id_param := scheduled_record.passenger_id,
                recipient_type_param := scheduled_record.recipient_type
              ) into email_result;
            end if;

            if coalesce((email_result->>'success')::boolean, false) then
              email_sent_count := email_sent_count + 1;
            else
              email_failed_count := email_failed_count + 1;
            end if;
          exception
            when others then
              email_failed_count := email_failed_count + 1;
          end;
        end if;
      else
        update public.scheduled_jobs
        set status = 'failed',
            error_message = coalesce(sms_result->>'error', sms_result->>'message', 'Unknown send error')
        where id = scheduled_record.id;

        failed_count := failed_count + 1;

        -- Still attempt email even when SMS fails
        select
          case
            when scheduled_record.recipient_type = 'next_of_kin' then p.next_of_kin_email
            else p.email
          end,
          p.full_name,
          p.next_of_kin_name,
          m.manifest_reference,
          tc.company_name,
          r.departure_location,
          r.destination,
          to_char(m.trip_date::date, 'FMDay, FMMonth DD, YYYY')
        into recipient_email,
             passenger_name,
             next_of_kin_name,
             manifest_reference,
             company_name,
             departure_location,
             destination_location,
             trip_date_text
        from public.passengers p
        left join public.manifests m on m.id = p.manifest_id
        left join public.transport_companies tc on tc.id = m.company_id
        left join public.routes r on r.id = m.route_id
        where p.id = scheduled_record.passenger_id;

        if recipient_email is not null and btrim(recipient_email) <> '' then
          email_subject := case
            when scheduled_record.message_type = 'arrival_30min' then 'Journey Arrival Update'
            else 'Journey Departure Update'
          end;

          select et.subject, et.body_html
          into template_subject, template_body
          from public.email_templates et
          where et.is_active = true
            and et.template_type in (
              case
                when scheduled_record.recipient_type = 'next_of_kin' then 'next_of_kin'
                else 'passenger'
              end,
              'general'
            )
          order by
            case
              when et.template_type = case
                when scheduled_record.recipient_type = 'next_of_kin' then 'next_of_kin'
                else 'passenger'
              end then 0
              when et.template_type = 'general' then 1
              else 2
            end,
            et.updated_at desc nulls last,
            et.created_at desc nulls last
          limit 1;

          rendered_subject := coalesce(template_subject, email_subject);
          rendered_body := coalesce(
            template_body,
            '<p>' || coalesce(scheduled_record.message_content, '') || '</p>' ||
            '<p><strong>Reference:</strong> ' || coalesce(manifest_reference, 'N/A') || '</p>' ||
            '<p><strong>Support:</strong> ' || support_phone || '</p>'
          );

          rendered_subject := replace(rendered_subject, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_subject := replace(rendered_subject, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_subject := replace(rendered_subject, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_subject := replace(rendered_subject, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_subject := replace(rendered_subject, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_subject := replace(rendered_subject, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_subject := replace(rendered_subject, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_subject := replace(rendered_subject, '{support_phone}', support_phone);

          rendered_body := replace(rendered_body, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_body := replace(rendered_body, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_body := replace(rendered_body, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_body := replace(rendered_body, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_body := replace(rendered_body, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_body := replace(rendered_body, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_body := replace(rendered_body, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_body := replace(rendered_body, '{support_phone}', support_phone);

          begin
            select public.send_email_via_resend(
              to_email := recipient_email,
              email_subject := rendered_subject,
              email_html := rendered_body,
              passenger_id_param := scheduled_record.passenger_id,
              recipient_type_param := scheduled_record.recipient_type
            ) into email_result;

            if not coalesce((email_result->>'success')::boolean, false)
               and coalesce(email_result->>'message', email_result->>'error', '') ilike '%Failed to fetch%'
            then
              perform pg_sleep(1);
              select public.send_email_via_resend(
                to_email := recipient_email,
                email_subject := rendered_subject,
                email_html := rendered_body,
                passenger_id_param := scheduled_record.passenger_id,
                recipient_type_param := scheduled_record.recipient_type
              ) into email_result;
            end if;

            if coalesce((email_result->>'success')::boolean, false) then
              email_sent_count := email_sent_count + 1;
            else
              email_failed_count := email_failed_count + 1;
            end if;
          exception
            when others then
              email_failed_count := email_failed_count + 1;
          end;
        end if;
      end if;
    exception
      when others then
        update public.scheduled_jobs
        set status = 'failed',
            error_message = sqlerrm
        where id = scheduled_record.id;

        failed_count := failed_count + 1;
    end;
  end loop;

  return jsonb_build_object(
    'processed', processed_count,
    'sent', sent_count,
    'failed', failed_count,
    'email_sent', email_sent_count,
    'email_failed', email_failed_count,
    'total', processed_count
  );
end;
$$;

-- Allow app calls (manual trigger from UI)
grant execute on function public.process_due_scheduled_jobs() to anon, authenticated, service_role;

-- Schedule background execution every minute (idempotent)
do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'process_due_scheduled_jobs_every_minute'
  ) then
    perform cron.schedule(
      'process_due_scheduled_jobs_every_minute',
      '* * * * *',
      $job$select public.process_due_scheduled_jobs();$job$
    );
  end if;
end;
$$;
