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

function normalizePhone(input) {
  const value = (input || '').trim()
  if (!value) return value
  if (value.startsWith('+')) return value

  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('234')) return `+${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `+234${digits.slice(1)}`
  return value
}

function asTime(date) {
  return date.toTimeString().slice(0, 5)
}

async function main() {
  const phoneArg = process.argv[2]
  const emailArg = process.argv[3]

  if (!phoneArg || !emailArg) {
    throw new Error('Usage: node scripts/runLiveE2E.mjs <phone> <email>')
  }

  const phone = normalizePhone(phoneArg)
  const email = emailArg.trim().toLowerCase()

  const env = loadEnv('.env')
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  }

  const supabase = createClient(url, anonKey)
  const now = new Date()
  const suffix = Date.now()

  const departureDate = new Date(now.getTime() - 6 * 60 * 1000)
  const arrivalDate = new Date(now.getTime() - 2 * 60 * 1000)

  const tripDate = departureDate.toISOString().slice(0, 10)
  const departureTime = asTime(departureDate)
  const arrivalTime = asTime(arrivalDate)

  const manifestReference = `E2E-${suffix}`
  const companyName = `E2E Transit ${suffix}`

  const report = {
    phone,
    email,
    manifestReference,
    created: {},
    processor: null,
    logs: {
      sms: [],
      email: []
    }
  }

  const { data: company, error: companyError } = await supabase
    .from('transport_companies')
    .insert([{
      company_name: companyName,
      contact_person: 'E2E Automation',
      phone_number: phone,
      email,
      status: 'active'
    }])
    .select()
    .single()

  if (companyError) throw companyError
  report.created.companyId = company.id

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .insert([{
      company_id: company.id,
      route_name: `E2E Lagos-Abuja ${suffix}`,
      departure_location: 'Lagos',
      destination: 'Abuja',
      duration_hours: 1,
      typical_departure_time: departureTime,
      status: 'active'
    }])
    .select()
    .single()

  if (routeError) throw routeError
  report.created.routeId = route.id

  const rulesPayload = [
    {
      rule_name: `E2E Passenger Rule ${suffix}`,
      template_id: null,
      company_id: company.id,
      route_id: route.id,
      recipient_type: 'passenger',
      timing_type: 'after_start',
      minutes_offset: 0,
      is_active: true
    },
    {
      rule_name: `E2E NOK Rule ${suffix}`,
      template_id: null,
      company_id: company.id,
      route_id: route.id,
      recipient_type: 'next_of_kin',
      timing_type: 'after_start',
      minutes_offset: 0,
      is_active: true
    }
  ]

  const { data: createdRules, error: rulesError } = await supabase
    .from('sms_schedule_rules')
    .insert(rulesPayload)
    .select('id, rule_name')

  if (rulesError) {
    report.created.ruleWarning = rulesError.message
  } else {
    report.created.ruleIds = (createdRules || []).map((row) => row.id)
  }

  const { data: manifest, error: manifestError } = await supabase
    .from('manifests')
    .insert([{
      manifest_reference: manifestReference,
      company_id: company.id,
      route_id: route.id,
      trip_date: tripDate,
      departure_time: departureTime,
      arrival_time: arrivalTime,
      total_passengers: 1,
      extraction_method: 'manual',
      processed_at: new Date().toISOString()
    }])
    .select()
    .single()

  if (manifestError) throw manifestError
  report.created.manifestId = manifest.id

  const { data: passenger, error: passengerError } = await supabase
    .from('passengers')
    .insert([{
      manifest_id: manifest.id,
      full_name: 'Live E2E Passenger',
      phone_number: phone,
      email,
      next_of_kin_name: 'Live E2E NOK',
      next_of_kin_phone: phone,
      next_of_kin_email: email,
      confidence_score: 100
    }])
    .select()
    .single()

  if (passengerError) throw passengerError
  report.created.passengerId = passenger.id

  const messageBody = `E2E test for ${manifestReference}: your journey notification pipeline is active.`

  const { data: jobs, error: jobsError } = await supabase
    .from('scheduled_jobs')
    .insert([
      {
        manifest_id: manifest.id,
        passenger_id: passenger.id,
        scheduled_time: departureDate.toISOString(),
        message_type: 'departure_30min',
        recipient_type: 'passenger',
        phone_number: phone,
        message_content: `${messageBody} [Passenger]`,
        status: 'pending'
      },
      {
        manifest_id: manifest.id,
        passenger_id: passenger.id,
        scheduled_time: departureDate.toISOString(),
        message_type: 'departure_30min',
        recipient_type: 'next_of_kin',
        phone_number: phone,
        message_content: `${messageBody} [NOK]`,
        status: 'pending'
      }
    ])
    .select('id, recipient_type')

  if (jobsError) throw jobsError
  report.created.jobIds = (jobs || []).map((row) => row.id)

  const { data: processorResult, error: processorError } = await supabase.rpc('process_due_scheduled_jobs')
  if (processorError) throw processorError
  report.processor = processorResult

  const { data: smsLogs, error: smsError } = await supabase
    .from('sms_logs')
    .select('id, status, phone_number, recipient_type, sent_at, error_message')
    .eq('passenger_id', passenger.id)
    .order('id', { ascending: false })
    .limit(10)

  if (smsError) throw smsError
  report.logs.sms = smsLogs || []

  const { data: emailLogs, error: emailError } = await supabase
    .from('email_logs')
    .select('id, status, email_address, recipient_type, sent_at, error_message')
    .eq('passenger_id', passenger.id)
    .order('id', { ascending: false })
    .limit(10)

  if (emailError) throw emailError
  report.logs.email = emailLogs || []

  console.log(JSON.stringify({ success: true, report }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2))
  process.exitCode = 1
})
