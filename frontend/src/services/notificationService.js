import { supabase } from './supabase'
import { sendBulkSMS } from './termiiService'
import { sendBulkEmails } from './emailService'
import {
  scheduleMessagesForManifest,
  queueDepartureImmediateJobs,
  queueArrivalReminderJobs,
  processDueScheduledJobs,
  processDueScheduledJobsViaRpc
} from './smsScheduler'
import { getTripDurationMs } from '../utils/tripTiming'

function toSchedulableManifest(manifest, company) {
  return {
    ...manifest,
    company_id: manifest.company_id,
    route_id: manifest.route_id,
    company_name: company?.company_name || manifest.company_name
  }
}

export async function sendImmediateNotifications({
  passengers,
  company,
  route,
  manifest,
  sendEmails,
  selectedTemplateId
}) {
  const manifestData = {
    company: company.company_name,
    departure: route.departure_location,
    destination: route.destination,
    trip_date: manifest.trip_date,
    manifest_reference: manifest.manifest_reference || 'N/A'
  }

  const smsResults = await sendBulkSMS(passengers, manifestData)

  let emailResults = null
  if (sendEmails) {
    emailResults = await sendBulkEmails(passengers, manifestData, selectedTemplateId)
  }

  return { smsResults, emailResults }
}

export async function scheduleManifestNotifications({
  manifest,
  route,
  company,
  passengers,
  scheduledDate,
  scheduledTime
}) {
  const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
  const durationMs = getTripDurationMs(manifest, route)
  const recalculatedArrivalDateTime = new Date(scheduledDateTime.getTime() + durationMs)
  const recalculatedArrivalTime = recalculatedArrivalDateTime.toTimeString().slice(0, 5)

  const { error: manifestUpdateError } = await supabase
    .from('manifests')
    .update({
      trip_date: scheduledDate,
      departure_time: scheduledTime,
      arrival_time: recalculatedArrivalTime
    })
    .eq('id', manifest.id)

  if (manifestUpdateError) throw manifestUpdateError

  const updatedManifest = {
    ...manifest,
    trip_date: scheduledDate,
    departure_time: scheduledTime,
    arrival_time: recalculatedArrivalTime,
    company_id: manifest.company_id,
    route_id: manifest.route_id,
    company_name: company.company_name
  }

  await supabase
    .from('scheduled_jobs')
    .delete()
    .eq('manifest_id', manifest.id)
    .eq('status', 'pending')

  const schedulingResult = await scheduleMessagesForManifest(
    toSchedulableManifest(updatedManifest, company),
    passengers,
    route
  )

  return {
    updatedManifest,
    schedulingResult,
    scheduledDateTime
  }
}

export async function enqueueManifestRuleNotifications({
  manifest,
  passengers,
  route,
  company
}) {
  const schedulingResult = await scheduleMessagesForManifest(
    toSchedulableManifest(manifest, company),
    passengers,
    route
  )

  return { schedulingResult }
}

export async function queueImmediateArrivalReminders({
  manifest,
  passengers,
  route,
  minutesBeforeArrival = 30
}) {
  const result = await queueArrivalReminderJobs(
    manifest,
    passengers,
    route,
    minutesBeforeArrival
  )

  return result
}

export async function queueImmediateDepartureNotifications({
  manifest,
  passengers,
  route
}) {
  const result = await queueDepartureImmediateJobs(
    manifest,
    passengers,
    route
  )

  return result
}

export async function processDueNotifications({ rpcOnly = false } = {}) {
  if (rpcOnly) {
    return processDueScheduledJobsViaRpc()
  }

  return processDueScheduledJobs()
}

export async function rescheduleManifestNotifications({
  manifestId,
  originalTripDate,
  originalDepartureTime,
  newDepartureDateTimeIso,
  durationHours = 8,
  originalArrivalTime = null
}) {
  const originalDeparture = new Date(`${originalTripDate}T${originalDepartureTime || '00:00'}`)
  const newDeparture = new Date(newDepartureDateTimeIso)
  const shiftMs = newDeparture.getTime() - originalDeparture.getTime()
  const safeDurationHours = Number.isFinite(Number(durationHours)) ? Number(durationHours) : 8

  let originalDurationMs = safeDurationHours * 3600000
  if (originalArrivalTime) {
    const originalArrival = new Date(`${originalTripDate}T${originalArrivalTime}`)
    if (Number.isFinite(originalArrival.getTime())) {
      let diff = originalArrival.getTime() - originalDeparture.getTime()
      if (diff < 0) {
        diff += 24 * 3600000
      }
      if (diff > 0) {
        originalDurationMs = diff
      }
    }
  }

  const recalculatedArrival = new Date(newDeparture.getTime() + originalDurationMs)

  if (!Number.isFinite(shiftMs)) {
    throw new Error('Invalid date/time values for rescheduling')
  }

  const { data: pendingJobs, error: jobsError } = await supabase
    .from('scheduled_jobs')
    .select('id, scheduled_time, message_type')
    .eq('manifest_id', manifestId)
    .eq('status', 'pending')

  if (jobsError) throw jobsError

  if (!pendingJobs || pendingJobs.length === 0) {
    return {
      rescheduled: 0,
      totalPending: 0,
      shiftMinutes: Math.round(shiftMs / 60000)
    }
  }

  for (const job of pendingJobs) {
    const oldTime = new Date(job.scheduled_time)
    let newTime = new Date(oldTime.getTime() + shiftMs)

    if (job.message_type === 'departure_30min') {
      newTime = new Date(newDeparture)
    } else if (job.message_type === 'arrival_30min') {
      newTime = new Date(recalculatedArrival)
    }

    const { error: updateError } = await supabase
      .from('scheduled_jobs')
      .update({ scheduled_time: newTime.toISOString() })
      .eq('id', job.id)

    if (updateError) throw updateError
  }

  return {
    rescheduled: pendingJobs.length,
    totalPending: pendingJobs.length,
    shiftMinutes: Math.round(shiftMs / 60000)
  }
}
