import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const manifestRef = process.argv[2]
if (!manifestRef) {
  console.error('Usage: node scripts/diagnoseManifest.mjs <manifest_reference>')
  process.exit(1)
}

const envText = fs.readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=')
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const { data: manifest, error: manifestError } = await supabase
  .from('manifests')
  .select('*')
  .eq('manifest_reference', manifestRef)
  .single()

if (manifestError || !manifest) {
  console.error('Manifest not found:', manifestError?.message || manifestRef)
  process.exit(1)
}

const { data: passengers } = await supabase
  .from('passengers')
  .select('id, full_name, phone_number, email, next_of_kin_name, next_of_kin_phone, next_of_kin_email')
  .eq('manifest_id', manifest.id)

const passengerIds = (passengers || []).map((p) => p.id)

const { data: jobs } = await supabase
  .from('scheduled_jobs')
  .select('id, passenger_id, recipient_type, phone_number, message_type, status, scheduled_time, sent_at, error_message')
  .eq('manifest_id', manifest.id)
  .order('scheduled_time', { ascending: true })

let smsLogs = []
let emailLogs = []
if (passengerIds.length > 0) {
  const smsResp = await supabase
    .from('sms_logs')
    .select('id, passenger_id, recipient_type, phone_number, status, sent_at, error_message, provider')
    .in('passenger_id', passengerIds)
    .order('sent_at', { ascending: false })
  smsLogs = smsResp.data || []

  const emailResp = await supabase
    .from('email_logs')
    .select('id, passenger_id, recipient_type, email_address, status, sent_at, error_message, provider')
    .in('passenger_id', passengerIds)
    .order('sent_at', { ascending: false })
  emailLogs = emailResp.data || []
}

console.log('=== MANIFEST ===')
console.log(JSON.stringify({
  id: manifest.id,
  manifest_reference: manifest.manifest_reference,
  trip_date: manifest.trip_date,
  departure_time: manifest.departure_time,
  arrival_time: manifest.arrival_time,
  total_passengers: manifest.total_passengers,
  processed_at: manifest.processed_at,
  created_at: manifest.created_at
}, null, 2))

console.log('\n=== PASSENGERS ===')
console.log(JSON.stringify(passengers || [], null, 2))

console.log('\n=== SCHEDULED JOBS ===')
console.log(JSON.stringify(jobs || [], null, 2))

const jobStats = (jobs || []).reduce((acc, j) => {
  acc[j.status] = (acc[j.status] || 0) + 1
  return acc
}, {})
console.log('\nJob status counts:', jobStats)

console.log('\n=== SMS LOGS ===')
console.log(JSON.stringify(smsLogs, null, 2))
console.log('SMS count:', smsLogs.length)

console.log('\n=== EMAIL LOGS ===')
console.log(JSON.stringify(emailLogs, null, 2))
console.log('Email count:', emailLogs.length)
