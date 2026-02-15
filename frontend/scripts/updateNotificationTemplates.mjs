import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  const env = {}
  const raw = fs.readFileSync(filePath, 'utf8')

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue
    const separatorIndex = line.indexOf('=')
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    env[key] = value
  }

  return env
}

async function upsertByName(supabase, table, payload, uniqueName) {
  const { data: existing, error: fetchError } = await supabase
    .from(table)
    .select('id')
    .eq('template_name', uniqueName)
    .limit(1)

  if (fetchError) throw fetchError

  if (existing && existing.length > 0) {
    const { error: updateError } = await supabase
      .from(table)
      .update(payload)
      .eq('id', existing[0].id)

    if (updateError) throw updateError
    return { action: 'updated', id: existing[0].id }
  }

  const { data: inserted, error: insertError } = await supabase
    .from(table)
    .insert([payload])
    .select('id')
    .single()

  if (insertError) throw insertError
  return { action: 'inserted', id: inserted.id }
}

async function main() {
  const env = loadEnv('.env')
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  }

  const supabase = createClient(url, anonKey)
  const results = []

  const smsPassenger = {
    template_name: 'Default Passenger Journey SMS',
    template_type: 'passenger',
    message_content: 'Hello {passenger_name}, your {departure} to {destination} trip with {company} on {trip_date} is active and insured. Ref: {manifest_reference}. Support: +2348000000000.',
    is_active: true
  }

  const smsNok = {
    template_name: 'Default NOK Journey SMS',
    template_type: 'next_of_kin',
    message_content: 'Travel update: {passenger_name} is on trip {departure} to {destination} with {company} on {trip_date}. Insurance is active. Ref: {manifest_reference}. Support: +2348000000000.',
    is_active: true
  }

  const emailPassenger = {
    template_name: 'Default Passenger Journey Email',
    template_type: 'passenger',
    subject: 'Trip Cover Active: {departure} → {destination}',
    body_html: '<h2>Hello {passenger_name},</h2><p>Your trip from <strong>{departure}</strong> to <strong>{destination}</strong> with <strong>{company}</strong> is active and covered.</p><p><strong>Trip date:</strong> {trip_date}<br/><strong>Reference:</strong> {manifest_reference}</p><p>If you need help, contact <strong>{support_phone}</strong>.</p><p>Regards,<br/>TravelCover Insurance Team</p>',
    is_active: true
  }

  const emailNok = {
    template_name: 'Default NOK Journey Email',
    template_type: 'next_of_kin',
    subject: 'Journey Update for {passenger_name}',
    body_html: '<h2>Hello {next_of_kin_name},</h2><p>This is a journey update for <strong>{passenger_name}</strong> traveling from <strong>{departure}</strong> to <strong>{destination}</strong> with <strong>{company}</strong>.</p><p><strong>Trip date:</strong> {trip_date}<br/><strong>Reference:</strong> {manifest_reference}</p><p>For support, call <strong>{support_phone}</strong>.</p><p>Regards,<br/>TravelCover Insurance Team</p>',
    is_active: true
  }

  results.push({ template: 'sms passenger', ...(await upsertByName(supabase, 'sms_templates', smsPassenger, smsPassenger.template_name)) })
  results.push({ template: 'sms nok', ...(await upsertByName(supabase, 'sms_templates', smsNok, smsNok.template_name)) })
  results.push({ template: 'email passenger', ...(await upsertByName(supabase, 'email_templates', emailPassenger, emailPassenger.template_name)) })
  results.push({ template: 'email nok', ...(await upsertByName(supabase, 'email_templates', emailNok, emailNok.template_name)) })

  console.log('[PASS] Notification templates updated.')
  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error('[FAIL] Failed to update templates.')
  console.error(JSON.stringify({ error: error.message }, null, 2))
  process.exitCode = 1
})
