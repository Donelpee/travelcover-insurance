import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const manifestRef = process.argv[2]
if (!manifestRef) {
  console.error('Usage: node scripts/backfillManifestJobs.mjs <manifest_reference>')
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
  throw new Error(`Manifest not found: ${manifestError?.message || manifestRef}`)
}

const { data: route } = await supabase
  .from('routes')
  .select('departure_location, destination')
  .eq('id', manifest.route_id)
  .single()

const { data: passengers, error: passengerError } = await supabase
  .from('passengers')
  .select('*')
  .eq('manifest_id', manifest.id)

if (passengerError) throw passengerError
if (!passengers || passengers.length === 0) {
  throw new Error('No passengers found for manifest')
}

await supabase
  .from('scheduled_jobs')
  .delete()
  .eq('manifest_id', manifest.id)
  .eq('status', 'pending')

const departureDateTime = new Date(`${manifest.trip_date}T${manifest.departure_time || '00:00'}`)
const arrivalDateTime = new Date(`${manifest.trip_date}T${manifest.arrival_time || manifest.departure_time || '00:00'}`)

const jobs = []
for (const passenger of passengers) {
  jobs.push({
    manifest_id: manifest.id,
    passenger_id: passenger.id,
    scheduled_time: departureDateTime.toISOString(),
    message_type: 'departure_30min',
    recipient_type: 'passenger',
    phone_number: passenger.phone_number,
    message_content: `Dear ${passenger.full_name}, your journey has started from ${route?.departure_location || 'origin'} to ${route?.destination || 'destination'}.`,
    status: 'pending'
  })

  jobs.push({
    manifest_id: manifest.id,
    passenger_id: passenger.id,
    scheduled_time: departureDateTime.toISOString(),
    message_type: 'departure_30min',
    recipient_type: 'next_of_kin',
    phone_number: passenger.next_of_kin_phone,
    message_content: `Hello ${passenger.next_of_kin_name}, ${passenger.full_name} has started the journey from ${route?.departure_location || 'origin'} to ${route?.destination || 'destination'}.`,
    status: 'pending'
  })

  jobs.push({
    manifest_id: manifest.id,
    passenger_id: passenger.id,
    scheduled_time: arrivalDateTime.toISOString(),
    message_type: 'arrival_30min',
    recipient_type: 'passenger',
    phone_number: passenger.phone_number,
    message_content: `Dear ${passenger.full_name}, your journey is due to complete at ${route?.destination || 'destination'}.`,
    status: 'pending'
  })

  jobs.push({
    manifest_id: manifest.id,
    passenger_id: passenger.id,
    scheduled_time: arrivalDateTime.toISOString(),
    message_type: 'arrival_30min',
    recipient_type: 'next_of_kin',
    phone_number: passenger.next_of_kin_phone,
    message_content: `Hello ${passenger.next_of_kin_name}, ${passenger.full_name} is due to arrive at ${route?.destination || 'destination'} now.`,
    status: 'pending'
  })
}

const { data: inserted, error: insertError } = await supabase
  .from('scheduled_jobs')
  .insert(jobs)
  .select('id')

if (insertError) throw insertError

console.log(`Backfilled scheduled jobs for ${manifestRef}: ${inserted?.length ?? 0}`)
