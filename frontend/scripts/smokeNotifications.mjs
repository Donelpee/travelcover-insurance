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

function isoNow() {
  return new Date().toISOString()
}

async function main() {
  const env = loadEnv('.env')
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  }

  const shouldForceTrigger = process.env.SMOKE_TRIGGER_DUE === 'true'
  const supabase = createClient(url, anonKey)

  const report = {
    startedAt: isoNow(),
    checks: {},
    trigger: {
      attempted: false,
      reason: null,
      result: null,
      error: null
    }
  }

  const [{ count: manifestCount, error: manifestError }, { count: passengerCount, error: passengerError }] = await Promise.all([
    supabase.from('manifests').select('id', { head: true, count: 'exact' }),
    supabase.from('passengers').select('id', { head: true, count: 'exact' })
  ])

  report.checks.manifests = {
    ok: !manifestError,
    count: manifestCount ?? 0,
    error: manifestError?.message ?? null
  }

  report.checks.passengers = {
    ok: !passengerError,
    count: passengerCount ?? 0,
    error: passengerError?.message ?? null
  }

  const now = isoNow()

  const [{ count: pendingCount, error: pendingError }, { count: dueCount, error: dueError }] = await Promise.all([
    supabase.from('scheduled_jobs').select('id', { head: true, count: 'exact' }).eq('status', 'pending'),
    supabase.from('scheduled_jobs').select('id', { head: true, count: 'exact' }).eq('status', 'pending').lte('scheduled_time', now)
  ])

  report.checks.scheduledQueue = {
    ok: !pendingError && !dueError,
    pendingCount: pendingCount ?? 0,
    dueCount: dueCount ?? 0,
    pendingError: pendingError?.message ?? null,
    dueError: dueError?.message ?? null
  }

  const { data: recentEmailLogs, error: recentEmailError } = await supabase
    .from('email_logs')
    .select('*')
    .order('id', { ascending: false })
    .limit(1)

  report.checks.emailLogs = {
    ok: !recentEmailError,
    latestId: recentEmailLogs?.[0]?.id ?? null,
    latestStatus: recentEmailLogs?.[0]?.status ?? null,
    error: recentEmailError?.message ?? null
  }

  const hasErrors = Object.values(report.checks).some((entry) => !entry.ok)

  if (hasErrors) {
    report.trigger.reason = 'Skipped due-job trigger because one or more baseline checks failed.'
  } else if ((dueCount ?? 0) > 0 && !shouldForceTrigger) {
    report.trigger.reason = 'Skipped due-job trigger because due jobs exist. Set SMOKE_TRIGGER_DUE=true to force.'
  } else {
    report.trigger.attempted = true
    const { data: triggerData, error: triggerError } = await supabase.rpc('process_due_scheduled_jobs')

    if (triggerError) {
      report.trigger.error = triggerError.message
    } else {
      report.trigger.result = triggerData
    }
  }

  report.finishedAt = isoNow()
  report.success = !hasErrors && !report.trigger.error

  if (report.success) {
    console.log('[PASS] Smoke checks completed successfully.')
  } else {
    console.log('[FAIL] Smoke checks found issues. Review JSON report below.')
  }
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error('[FAIL] Smoke script crashed before checks completed.')
  console.error(JSON.stringify({ success: false, error: error.message }, null, 2))
  process.exitCode = 1
})
