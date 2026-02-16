-- Reset notification templates to a single high-quality default per channel
-- Run in Supabase SQL Editor
-- This keeps template CRUD in the app intact, but clears old template rows.

begin;

-- Detach existing SMS schedule rules from old templates before deletion.
update public.sms_schedule_rules
set template_id = null
where template_id is not null;

-- Remove all existing templates.
delete from public.sms_templates;
delete from public.email_templates;

-- Insert one shared SMS template (works for passenger + next of kin).
-- If schema constrains template_type to passenger/next_of_kin, create one for each type with same content.
do $$
begin
  begin
    insert into public.sms_templates (
      template_name,
      template_type,
      message_content,
      is_active
    )
    values (
      'TravelCover Unified Journey SMS',
      'general',
      'TravelCover update: {passenger_name} is on a protected trip from {departure} to {destination} with {company} on {trip_date}. Ref: {manifest_reference}. For urgent support, call +234 800 000 0000.',
      true
    );
  exception
    when check_violation then
      insert into public.sms_templates (
        template_name,
        template_type,
        message_content,
        is_active
      )
      values
      (
        'TravelCover Unified Journey SMS (Passenger)',
        'passenger',
        'TravelCover update: {passenger_name} is on a protected trip from {departure} to {destination} with {company} on {trip_date}. Ref: {manifest_reference}. For urgent support, call +234 800 000 0000.',
        true
      ),
      (
        'TravelCover Unified Journey SMS (Next of Kin)',
        'next_of_kin',
        'TravelCover update: {passenger_name} is on a protected trip from {departure} to {destination} with {company} on {trip_date}. Ref: {manifest_reference}. For urgent support, call +234 800 000 0000.',
        true
      );
  end;
end $$;

-- Insert one rich shared email template (works for passenger + next of kin).
insert into public.email_templates (
  template_name,
  template_type,
  subject,
  body_html,
  is_active
)
values (
  'TravelCover Unified Journey Email',
  'general',
  'TravelCover Journey Update • {departure} to {destination}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f3f7ff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7ff;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbeafe;">
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8,#0ea5e9);padding:24px 28px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;font-weight:700;">TravelCover Journey Notification</h1>
              <p style="margin:8px 0 0;color:#e0f2fe;font-size:14px;line-height:1.5;">Reliable protection and timely trip updates for passengers and their families.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hello <strong>{passenger_name}</strong>,</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                This is to confirm that the journey from <strong>{departure}</strong> to <strong>{destination}</strong>
                with <strong>{company}</strong> on <strong>{trip_date}</strong> is active and covered by TravelCover.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="background:#eff6ff;padding:14px 16px;font-size:14px;font-weight:600;color:#1e3a8a;">Trip Summary</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Passenger:</strong> {passenger_name}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Next of Kin:</strong> {next_of_kin_name}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Route:</strong> {departure} to {destination}</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#334155;"><strong>Travel Date:</strong> {trip_date}</p>
                    <p style="margin:0;font-size:14px;color:#334155;"><strong>Reference:</strong> {manifest_reference}</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;border-left:4px solid #2563eb;background:#f8fafc;">
                <tr>
                  <td style="padding:12px 14px;">
                    <p style="margin:0;font-size:14px;color:#1e293b;"><strong>24/7 Support:</strong> {support_phone}</p>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#475569;">Thank you for choosing TravelCover. We wish you a safe and comfortable journey.</p>
              <p style="margin:14px 0 0;font-size:14px;color:#0f172a;"><strong>TravelCover Insurance Team</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 20px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#64748b;">© TravelCover Insurance • Journey Protection & Notifications</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  true
);

commit;

-- Verification
select 'sms_templates' as table_name, id, template_name, template_type, is_active
from public.sms_templates
union all
select 'email_templates' as table_name, id, template_name, template_type, is_active
from public.email_templates
order by table_name, template_name;
