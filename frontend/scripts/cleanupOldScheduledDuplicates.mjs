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

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase()
}

function toTime(row) {
  const scheduledMs = new Date(row.scheduled_time).getTime()
  const createdMs = new Date(row.created_at).getTime()

  return {
    scheduledMs: Number.isFinite(scheduledMs) ? scheduledMs : -1,
    createdMs: Number.isFinite(createdMs) ? createdMs : -1
  }
}

function sortNewestFirst(a, b) {
  const aTime = toTime(a)
  const bTime = toTime(b)

  if (bTime.scheduledMs !== aTime.scheduledMs) {
    return bTime.scheduledMs - aTime.scheduledMs
  }

  return bTime.createdMs - aTime.createdMs
}

async function main() {
  const env = loadEnv('.env')
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  }

  const applyCleanup = process.env.APPLY_CLEANUP === 'true'
  const removableStatuses = new Set(['failed', 'cancelled'])
  const supabase = createClient(url, anonKey)

  const { data: jobs, error: jobsError } = await supabase
    .from('scheduled_jobs')
    .select('id, manifest_id, passenger_id, phone_number, message_type, status, scheduled_time, created_at')

  if (jobsError) {
    throw jobsError
  }

  const groups = new Map()

  for (const row of jobs || []) {
    const passengerKey = row.passenger_id || row.phone_number || 'unknown-recipient'
    const key = `${row.manifest_id || 'unknown-manifest'}|${passengerKey}|${row.message_type || 'generic'}`

    if (!groups.has(key)) {
      groups.set(key, [])
    }

    groups.get(key).push(row)
  }

  const removableIds = []
  let duplicateGroups = 0

  for (const rows of groups.values()) {
    if (rows.length <= 1) continue

    duplicateGroups += 1

    const ordered = [...rows].sort(sortNewestFirst)
    const olderRows = ordered.slice(1)

    for (const row of olderRows) {
      if (removableStatuses.has(normalizeStatus(row.status))) {
        removableIds.push(row.id)
      }
    }
  }

  const report = {
    mode: applyCleanup ? 'apply' : 'dry-run',
    totalRows: jobs?.length || 0,
    duplicateGroups,
    removableRows: removableIds.length,
    sampleIds: removableIds.slice(0, 10)
  }

  if (!applyCleanup) {
    console.log('[PASS] Cleanup dry-run completed (no rows deleted).')
    console.log(JSON.stringify(report, null, 2))
    return
  }

  if (removableIds.length === 0) {
    console.log('[PASS] Cleanup apply completed (nothing to delete).')
    console.log(JSON.stringify(report, null, 2))
    return
  }

  const chunkSize = 500
  let deleted = 0

  for (let index = 0; index < removableIds.length; index += chunkSize) {
    const chunk = removableIds.slice(index, index + chunkSize)
    const { data, error } = await supabase
      .from('scheduled_jobs')
      .delete()
      .in('id', chunk)
      .select('id')

    if (error) {
      throw error
    }

    deleted += data?.length || 0
  }

  console.log('[PASS] Cleanup apply completed.')
  console.log(JSON.stringify({ ...report, deleted }, null, 2))
}

main().catch((error) => {
  console.error('[FAIL] Cleanup script failed.')
  console.error(JSON.stringify({ error: error.message }, null, 2))
  process.exitCode = 1
})
