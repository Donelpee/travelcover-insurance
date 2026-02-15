import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const manifestRef = process.argv[2]
if (!manifestRef) {
  console.error('Usage: node scripts/cleanupTestData.mjs <manifest_reference>')
  process.exit(1)
}

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

async function main() {
  const env = loadEnv('.env')
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  }

  const supabase = createClient(url, anonKey)

  const { data: manifest, error: manifestError } = await supabase
    .from('manifests')
    .select('id, manifest_reference, company_id, route_id')
    .eq('manifest_reference', manifestRef)
    .single()

  if (manifestError || !manifest) {
    console.log(JSON.stringify({ success: true, message: 'Manifest already absent', manifestRef }, null, 2))
    return
  }

  const { data: passengers } = await supabase
    .from('passengers')
    .select('id')
    .eq('manifest_id', manifest.id)

  const passengerIds = (passengers || []).map((row) => row.id)

  if (passengerIds.length > 0) {
    await supabase.from('sms_logs').delete().in('passenger_id', passengerIds)
    await supabase.from('email_logs').delete().in('passenger_id', passengerIds)
  }

  await supabase.from('scheduled_jobs').delete().eq('manifest_id', manifest.id)
  await supabase.from('passengers').delete().eq('manifest_id', manifest.id)
  await supabase.from('manifests').delete().eq('id', manifest.id)

  // Cleanup route/company only if they look like E2E records and are no longer referenced
  const { count: routeUseCount } = await supabase
    .from('manifests')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', manifest.route_id)

  if ((routeUseCount ?? 0) === 0) {
    await supabase.from('routes').delete().eq('id', manifest.route_id)
  }

  const { count: companyUseCount } = await supabase
    .from('manifests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', manifest.company_id)

  if ((companyUseCount ?? 0) === 0) {
    await supabase.from('transport_companies').delete().eq('id', manifest.company_id)
  }

  console.log(JSON.stringify({
    success: true,
    removed: {
      manifestRef,
      manifestId: manifest.id,
      passengerCount: passengerIds.length
    }
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2))
  process.exitCode = 1
})
