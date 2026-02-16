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
  recipient_name text;
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
  manifest_trip_date date;
  manifest_departure_time time;
  manifest_arrival_time time;
  route_duration_hours numeric;
  departure_ts timestamptz;
  arrival_ts timestamptz;
  arrival_send_time timestamptz;
  notification_stage text;
  stage_label text;
  stage_message text;
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
    select id, passenger_id, recipient_type, phone_number, message_content, message_type, scheduled_time
    from public.scheduled_jobs
    where status = 'pending'
      and scheduled_time <= now()
    order by scheduled_time asc
    for update skip locked
  loop
    processed_count := processed_count + 1;

    begin
      if scheduled_record.message_type = 'arrival_30min' then
        manifest_trip_date := null;
        manifest_departure_time := null;
        manifest_arrival_time := null;
        route_duration_hours := null;
        departure_ts := null;
        arrival_ts := null;
        arrival_send_time := null;

        select
          m.trip_date::date,
          m.departure_time,
          m.arrival_time,
          r.duration_hours
        into manifest_trip_date,
             manifest_departure_time,
             manifest_arrival_time,
             route_duration_hours
        from public.passengers p
        left join public.manifests m on m.id = p.manifest_id
        left join public.routes r on r.id = m.route_id
        where p.id = scheduled_record.passenger_id
        limit 1;

        if manifest_trip_date is not null and manifest_departure_time is not null then
          departure_ts := (manifest_trip_date::text || ' ' || manifest_departure_time::text)::timestamptz;
        end if;

        if manifest_trip_date is not null and manifest_arrival_time is not null then
          arrival_ts := (manifest_trip_date::text || ' ' || manifest_arrival_time::text)::timestamptz;

          if departure_ts is not null and arrival_ts <= departure_ts then
            arrival_ts := arrival_ts + interval '1 day';
          end if;
        elsif departure_ts is not null then
          arrival_ts := departure_ts + make_interval(secs => greatest(1::numeric, coalesce(route_duration_hours, 8)) * 3600);
        end if;

        if arrival_ts is not null then
          arrival_send_time := arrival_ts - interval '30 minutes';

          if arrival_send_time > now() then
            update public.scheduled_jobs
            set scheduled_time = arrival_send_time
            where id = scheduled_record.id;

            continue;
          end if;
        end if;
      end if;

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

        recipient_name := case
          when scheduled_record.recipient_type = 'next_of_kin' then coalesce(next_of_kin_name, passenger_name, 'Next of Kin')
          else coalesce(passenger_name, 'Passenger')
        end;

        if recipient_email is not null and btrim(recipient_email) <> '' then
          notification_stage := case
            when scheduled_record.message_type = 'arrival_30min' then 'arrival'
            else 'departure'
          end;

          stage_label := case
            when notification_stage = 'arrival' and scheduled_record.recipient_type = 'next_of_kin' then 'Family Arrival Reminder'
            when notification_stage = 'arrival' then 'Arrival Reminder'
            when scheduled_record.recipient_type = 'next_of_kin' then 'Family Departure Update'
            else 'Departure Update'
          end;

          stage_message := case
            when notification_stage = 'arrival' and scheduled_record.recipient_type = 'next_of_kin' then coalesce(passenger_name, 'Passenger') || ' is approximately 30 minutes from arrival at ' || coalesce(destination_location, 'the destination') || '. TravelCover support remains active until trip completion.'
            when notification_stage = 'arrival' then 'You are approximately 30 minutes from arrival at ' || coalesce(destination_location, 'your destination') || '. Your TravelCover protection remains active until trip completion.'
            when scheduled_record.recipient_type = 'next_of_kin' then coalesce(passenger_name, 'Passenger') || ' has departed from ' || coalesce(departure_location, 'departure point') || ' to ' || coalesce(destination_location, 'destination') || '. TravelCover protection is active for this trip.'
            else 'Your journey has departed from ' || coalesce(departure_location, 'departure point') || ' to ' || coalesce(destination_location, 'destination') || '. Your TravelCover protection is active.'
          end;

          email_subject := case
            when notification_stage = 'arrival' then 'TravelCover Arrival Update'
            else 'TravelCover Departure Update'
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
            '<!DOCTYPE html>' ||
            '<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>' ||
            '<body style="margin:0;padding:0;background:#f3f7ff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">' ||
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7ff;padding:24px 12px;"><tr><td align="center">' ||
            '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbeafe;">' ||
            '<tr><td style="background:linear-gradient(135deg,#1d4ed8,#0ea5e9);padding:24px 28px;">' ||
            '<h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:700;">TravelCover {stage_label}</h1>' ||
            '<p style="margin:8px 0 0;color:#e0f2fe;font-size:14px;line-height:1.5;">Reliable protection and timely trip updates for passengers and their families.</p>' ||
            '</td></tr><tr><td style="padding:28px;">' ||
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hello <strong>{recipient_name}</strong>,</p>' ||
            '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">{stage_message}</p>' ||
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;">' ||
            '<tr><td style="background:#eff6ff;padding:14px 16px;font-size:14px;font-weight:600;color:#1e3a8a;">Trip Summary</td></tr>' ||
            '<tr><td style="padding:14px 16px;">' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Passenger:</strong> {passenger_name}</p>' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Next of Kin:</strong> {next_of_kin_name}</p>' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Route:</strong> {departure} to {destination}</p>' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Travel Date:</strong> {trip_date}</p>' ||
            '<p style="margin:0;font-size:14px;color:#334155;"><strong>Reference:</strong> {manifest_reference}</p>' ||
            '</td></tr></table>' ||
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;border-left:4px solid #2563eb;background:#f8fafc;">' ||
            '<tr><td style="padding:12px 14px;"><p style="margin:0;font-size:14px;color:#1e293b;"><strong>24/7 Support:</strong> {support_phone}</p></td></tr>' ||
            '</table>' ||
            '<p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#475569;">' || coalesce(scheduled_record.message_content, '') || '</p>' ||
            '<p style="margin:14px 0 0;font-size:14px;color:#0f172a;"><strong>TravelCover Insurance Team</strong></p>' ||
            '</td></tr><tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 20px;text-align:center;">' ||
            '<p style="margin:0;font-size:12px;color:#64748b;">© TravelCover Insurance • Journey Protection & Notifications</p>' ||
            '</td></tr></table></td></tr></table></body></html>'
          );

          rendered_subject := replace(rendered_subject, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_subject := replace(rendered_subject, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_subject := replace(rendered_subject, '{recipient_name}', coalesce(recipient_name, 'Passenger'));
          rendered_subject := replace(rendered_subject, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_subject := replace(rendered_subject, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_subject := replace(rendered_subject, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_subject := replace(rendered_subject, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_subject := replace(rendered_subject, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_subject := replace(rendered_subject, '{support_phone}', support_phone);
          rendered_subject := replace(rendered_subject, '{notification_stage}', notification_stage);
          rendered_subject := replace(rendered_subject, '{stage_label}', stage_label);
          rendered_subject := replace(rendered_subject, '{stage_message}', stage_message);

          rendered_body := replace(rendered_body, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_body := replace(rendered_body, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_body := replace(rendered_body, '{recipient_name}', coalesce(recipient_name, 'Passenger'));
          rendered_body := replace(rendered_body, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_body := replace(rendered_body, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_body := replace(rendered_body, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_body := replace(rendered_body, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_body := replace(rendered_body, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_body := replace(rendered_body, '{support_phone}', support_phone);
          rendered_body := replace(rendered_body, '{notification_stage}', notification_stage);
          rendered_body := replace(rendered_body, '{stage_label}', stage_label);
          rendered_body := replace(rendered_body, '{stage_message}', stage_message);

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

        recipient_name := case
          when scheduled_record.recipient_type = 'next_of_kin' then coalesce(next_of_kin_name, passenger_name, 'Next of Kin')
          else coalesce(passenger_name, 'Passenger')
        end;

        if recipient_email is not null and btrim(recipient_email) <> '' then
          notification_stage := case
            when scheduled_record.message_type = 'arrival_30min' then 'arrival'
            else 'departure'
          end;

          stage_label := case
            when notification_stage = 'arrival' and scheduled_record.recipient_type = 'next_of_kin' then 'Family Arrival Reminder'
            when notification_stage = 'arrival' then 'Arrival Reminder'
            when scheduled_record.recipient_type = 'next_of_kin' then 'Family Departure Update'
            else 'Departure Update'
          end;

          stage_message := case
            when notification_stage = 'arrival' and scheduled_record.recipient_type = 'next_of_kin' then coalesce(passenger_name, 'Passenger') || ' is approximately 30 minutes from arrival at ' || coalesce(destination_location, 'the destination') || '. TravelCover support remains active until trip completion.'
            when notification_stage = 'arrival' then 'You are approximately 30 minutes from arrival at ' || coalesce(destination_location, 'your destination') || '. Your TravelCover protection remains active until trip completion.'
            when scheduled_record.recipient_type = 'next_of_kin' then coalesce(passenger_name, 'Passenger') || ' has departed from ' || coalesce(departure_location, 'departure point') || ' to ' || coalesce(destination_location, 'destination') || '. TravelCover protection is active for this trip.'
            else 'Your journey has departed from ' || coalesce(departure_location, 'departure point') || ' to ' || coalesce(destination_location, 'destination') || '. Your TravelCover protection is active.'
          end;

          email_subject := case
            when notification_stage = 'arrival' then 'TravelCover Arrival Update'
            else 'TravelCover Departure Update'
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
            '<!DOCTYPE html>' ||
            '<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>' ||
            '<body style="margin:0;padding:0;background:#f3f7ff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">' ||
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7ff;padding:24px 12px;"><tr><td align="center">' ||
            '<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbeafe;">' ||
            '<tr><td style="background:linear-gradient(135deg,#1d4ed8,#0ea5e9);padding:24px 28px;">' ||
            '<h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:700;">TravelCover {stage_label}</h1>' ||
            '<p style="margin:8px 0 0;color:#e0f2fe;font-size:14px;line-height:1.5;">Reliable protection and timely trip updates for passengers and their families.</p>' ||
            '</td></tr><tr><td style="padding:28px;">' ||
            '<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hello <strong>{recipient_name}</strong>,</p>' ||
            '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">{stage_message}</p>' ||
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;">' ||
            '<tr><td style="background:#eff6ff;padding:14px 16px;font-size:14px;font-weight:600;color:#1e3a8a;">Trip Summary</td></tr>' ||
            '<tr><td style="padding:14px 16px;">' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Passenger:</strong> {passenger_name}</p>' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Next of Kin:</strong> {next_of_kin_name}</p>' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Route:</strong> {departure} to {destination}</p>' ||
            '<p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Travel Date:</strong> {trip_date}</p>' ||
            '<p style="margin:0;font-size:14px;color:#334155;"><strong>Reference:</strong> {manifest_reference}</p>' ||
            '</td></tr></table>' ||
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;border-left:4px solid #2563eb;background:#f8fafc;">' ||
            '<tr><td style="padding:12px 14px;"><p style="margin:0;font-size:14px;color:#1e293b;"><strong>24/7 Support:</strong> {support_phone}</p></td></tr>' ||
            '</table>' ||
            '<p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#475569;">' || coalesce(scheduled_record.message_content, '') || '</p>' ||
            '<p style="margin:14px 0 0;font-size:14px;color:#0f172a;"><strong>TravelCover Insurance Team</strong></p>' ||
            '</td></tr><tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 20px;text-align:center;">' ||
            '<p style="margin:0;font-size:12px;color:#64748b;">© TravelCover Insurance • Journey Protection & Notifications</p>' ||
            '</td></tr></table></td></tr></table></body></html>'
          );

          rendered_subject := replace(rendered_subject, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_subject := replace(rendered_subject, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_subject := replace(rendered_subject, '{recipient_name}', coalesce(recipient_name, 'Passenger'));
          rendered_subject := replace(rendered_subject, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_subject := replace(rendered_subject, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_subject := replace(rendered_subject, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_subject := replace(rendered_subject, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_subject := replace(rendered_subject, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_subject := replace(rendered_subject, '{support_phone}', support_phone);
          rendered_subject := replace(rendered_subject, '{notification_stage}', notification_stage);
          rendered_subject := replace(rendered_subject, '{stage_label}', stage_label);
          rendered_subject := replace(rendered_subject, '{stage_message}', stage_message);

          rendered_body := replace(rendered_body, '{passenger_name}', coalesce(passenger_name, 'Passenger'));
          rendered_body := replace(rendered_body, '{next_of_kin_name}', coalesce(next_of_kin_name, 'Next of Kin'));
          rendered_body := replace(rendered_body, '{recipient_name}', coalesce(recipient_name, 'Passenger'));
          rendered_body := replace(rendered_body, '{company}', coalesce(company_name, 'TravelCover'));
          rendered_body := replace(rendered_body, '{departure}', coalesce(departure_location, 'Departure'));
          rendered_body := replace(rendered_body, '{destination}', coalesce(destination_location, 'Destination'));
          rendered_body := replace(rendered_body, '{trip_date}', coalesce(trip_date_text, ''));
          rendered_body := replace(rendered_body, '{manifest_reference}', coalesce(manifest_reference, 'N/A'));
          rendered_body := replace(rendered_body, '{support_phone}', support_phone);
          rendered_body := replace(rendered_body, '{notification_stage}', notification_stage);
          rendered_body := replace(rendered_body, '{stage_label}', stage_label);
          rendered_body := replace(rendered_body, '{stage_message}', stage_message);

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
