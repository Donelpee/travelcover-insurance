import { supabase } from './supabase'
import { sendTermiiSMS } from './termiiService'

/**
 * Calculate scheduled SMS times based on route duration and trip date/time
 */
export function calculateScheduledTimes(tripDate, departureTime, durationHours) {
  // Combine trip date and departure time
  const tripDateTime = new Date(`${tripDate}T${departureTime}`)
  
  // Calculate trip end time
  const endDateTime = new Date(tripDateTime.getTime() + (durationHours * 60 * 60 * 1000))
  
  return {
    tripStart: tripDateTime,
    tripEnd: endDateTime,
    durationHours
  }
}

/**
 * Apply timing offset to calculate actual send time
 */
export function applyTimingOffset(baseTime, timingType, minutesOffset) {
  const sendTime = new Date(baseTime)
  
  if (timingType === 'after_start') {
    // Add minutes after start
    sendTime.setMinutes(sendTime.getMinutes() + minutesOffset)
  } else if (timingType === 'before_end') {
    // Subtract minutes before end
    sendTime.setMinutes(sendTime.getMinutes() - minutesOffset)
  }
  
  return sendTime
}

function getSafeMessageType(timingType) {
  return timingType === 'before_end' ? 'arrival_30min' : 'departure_30min'
}

function buildDefaultScheduledMessage(passenger, manifest, route, rule) {
  const tripDate = new Date(manifest.trip_date).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })

  const referenceTimeLabel = rule.timing_type === 'before_end'
    ? `${rule.minutes_offset} mins before arrival`
    : `${rule.minutes_offset} mins after departure`

  const journeyLabel = `${route.departure_location} → ${route.destination}`
  const companyLabel = manifest.company_name || 'your transport operator'
  const ref = manifest.manifest_reference || 'N/A'

  if (rule.recipient_type === 'next_of_kin') {
    return `Travel update: ${passenger.full_name} is on trip ${journeyLabel} with ${companyLabel} (${tripDate}). Checkpoint: ${referenceTimeLabel}. Insurance is active. Ref: ${ref}. Support: +2348000000000.`
  }

  return `Hello ${passenger.full_name}, your ${journeyLabel} trip with ${companyLabel} (${tripDate}) is active and insured. Checkpoint: ${referenceTimeLabel}. Ref: ${ref}. Support: +2348000000000.`
}

function resolveSmsTemplateForRecipient(templates, recipientType) {
  const exact = templates.find((template) => template.template_type === recipientType)
  if (exact?.message_content) return exact

  const general = templates.find((template) => template.template_type === 'general')
  if (general?.message_content) return general

  return null
}

function getManifestArrivalDateTime(manifest, route) {
  if (manifest?.trip_date && manifest?.arrival_time) {
    const parsedArrival = new Date(`${manifest.trip_date}T${manifest.arrival_time}`)
    if (Number.isFinite(parsedArrival.getTime())) {
      return parsedArrival
    }
  }

  if (manifest?.trip_date && manifest?.departure_time) {
    const parsedDeparture = new Date(`${manifest.trip_date}T${manifest.departure_time}`)
    if (Number.isFinite(parsedDeparture.getTime())) {
      const durationMinutes = Number.isFinite(Number(route?.duration_hours))
        ? Math.max(1, Math.round(Number(route.duration_hours) * 60))
        : 8 * 60
      return new Date(parsedDeparture.getTime() + durationMinutes * 60000)
    }
  }

  return null
}

export async function queueArrivalReminderJobs(manifest, passengers, route, minutesBeforeArrival = 30) {
  const arrivalDateTime = getManifestArrivalDateTime(manifest, route)
  if (!arrivalDateTime) {
    throw new Error('Unable to compute trip arrival time for arrival reminders')
  }

  const scheduledDateTime = new Date(arrivalDateTime.getTime() - (minutesBeforeArrival * 60000))

  const { data: templates, error: templatesError } = await supabase
    .from('sms_templates')
    .select('id, template_type, message_content, is_active, updated_at, created_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (templatesError) {
    throw templatesError
  }

  const rulePassenger = {
    recipient_type: 'passenger',
    timing_type: 'before_end',
    minutes_offset: minutesBeforeArrival
  }

  const ruleNextOfKin = {
    recipient_type: 'next_of_kin',
    timing_type: 'before_end',
    minutes_offset: minutesBeforeArrival
  }

  const jobs = []

  for (const passenger of passengers) {
    if (passenger.phone_number) {
      const template = resolveSmsTemplateForRecipient(templates || [], 'passenger')
      jobs.push({
        manifest_id: manifest.id,
        passenger_id: passenger.id,
        message_type: 'arrival_30min',
        recipient_type: 'passenger',
        phone_number: passenger.phone_number,
        message_content: generateMessageFromTemplate(template?.message_content || null, passenger, manifest, route, rulePassenger),
        scheduled_time: scheduledDateTime.toISOString(),
        status: 'pending'
      })
    }

    if (passenger.next_of_kin_phone) {
      const template = resolveSmsTemplateForRecipient(templates || [], 'next_of_kin')
      jobs.push({
        manifest_id: manifest.id,
        passenger_id: passenger.id,
        message_type: 'arrival_30min',
        recipient_type: 'next_of_kin',
        phone_number: passenger.next_of_kin_phone,
        message_content: generateMessageFromTemplate(template?.message_content || null, passenger, manifest, route, ruleNextOfKin),
        scheduled_time: scheduledDateTime.toISOString(),
        status: 'pending'
      })
    }
  }

  if (jobs.length === 0) {
    return {
      success: true,
      count: 0,
      scheduled_time: scheduledDateTime.toISOString()
    }
  }

  const { error: insertError } = await supabase
    .from('scheduled_jobs')
    .insert(jobs)

  if (insertError) {
    throw insertError
  }

  return {
    success: true,
    count: jobs.length,
    scheduled_time: scheduledDateTime.toISOString()
  }
}

/**
 * Create scheduled SMS for a manifest
 */
export async function scheduleMessagesForManifest(manifest, passengers, route) {
  try {
    const defaultRules = [
      {
        rule_name: 'Passenger 30 mins after departure',
        recipient_type: 'passenger',
        timing_type: 'after_start',
        minutes_offset: 30,
        sms_templates: null
      },
      {
        rule_name: 'Next of Kin 30 mins after departure',
        recipient_type: 'next_of_kin',
        timing_type: 'after_start',
        minutes_offset: 30,
        sms_templates: null
      },
      {
        rule_name: 'Passenger 30 mins before arrival',
        recipient_type: 'passenger',
        timing_type: 'before_end',
        minutes_offset: 30,
        sms_templates: null
      },
      {
        rule_name: 'Next of Kin 30 mins before arrival',
        recipient_type: 'next_of_kin',
        timing_type: 'before_end',
        minutes_offset: 30,
        sms_templates: null
      }
    ]

    // Get active schedule rules
    const { data: rules, error: rulesError } = await supabase
      .from('sms_schedule_rules')
      .select(`
        *,
        sms_templates (*)
      `)
      .eq('is_active', true)

    if (rulesError) throw rulesError

    const applicableConfiguredRules = (rules || []).filter((rule) => {
      const matchesCompany = !rule.company_id || rule.company_id === route?.company_id || rule.company_id === manifest?.company_id
      const matchesRoute = !rule.route_id || rule.route_id === route?.id || rule.route_id === manifest?.route_id
      return matchesCompany && matchesRoute
    })

    const configuredRules = applicableConfiguredRules.length > 0
      ? applicableConfiguredRules
      : defaultRules

    // Calculate trip times
    const { tripStart, tripEnd } = calculateScheduledTimes(
      manifest.trip_date,
      manifest.departure_time,
      route.duration_hours
    )

    console.log('Trip Start:', tripStart)
    console.log('Trip End:', tripEnd)
    console.log('Duration:', route.duration_hours, 'hours')

    const scheduledMessages = []

    // For each passenger
    for (const passenger of passengers) {
      // For each rule
      for (const rule of configuredRules) {
        // Check if rule applies to this recipient type
        if (rule.recipient_type === 'passenger' || rule.recipient_type === 'next_of_kin') {
          const phone = rule.recipient_type === 'passenger' 
            ? passenger.phone_number 
            : passenger.next_of_kin_phone

          // Calculate when to send
          const baseTime = rule.timing_type === 'after_start' ? tripStart : tripEnd
          const scheduledTime = applyTimingOffset(baseTime, rule.timing_type, rule.minutes_offset)

          // Generate message content
          const messageContent = generateMessageFromTemplate(
            rule.sms_templates?.message_content || null,
            passenger,
            manifest,
            route,
            rule
          )

          scheduledMessages.push({
            manifest_id: manifest.id,
            passenger_id: passenger.id,
            message_type: getSafeMessageType(rule.timing_type),
            recipient_type: rule.recipient_type,
            phone_number: phone,
            message_content: messageContent,
            scheduled_time: scheduledTime.toISOString(),
            status: 'pending'
          })
        }
      }
    }

    if (scheduledMessages.length === 0) {
      return {
        success: true,
        count: 0,
        messages: []
      }
    }

    // Insert all scheduled messages
    const { data, error } = await supabase
      .from('scheduled_jobs')
      .insert(scheduledMessages)

    if (error) throw error

    console.log(`Scheduled ${scheduledMessages.length} messages`)
    
    return {
      success: true,
      count: scheduledMessages.length,
      messages: scheduledMessages
    }

  } catch (error) {
    console.error('Error scheduling messages:', error)
    throw error
  }
}

/**
 * Generate message content from template
 */
function generateMessageFromTemplate(template, passenger, manifest, route, rule) {
  if (!template) {
    return buildDefaultScheduledMessage(passenger, manifest, route, rule)
  }

  return template
    .replace(/{passenger_name}/g, passenger.full_name)
    .replace(/{next_of_kin_name}/g, passenger.next_of_kin_name)
    .replace(/{departure}/g, route.departure_location)
    .replace(/{destination}/g, route.destination)
    .replace(/{company}/g, manifest.company_name || 'Transport Company')
    .replace(/{manifest_reference}/g, manifest.manifest_reference || 'N/A')
    .replace(/{departure_time}/g, manifest.departure_time || '')
    .replace(/{arrival_time}/g, manifest.arrival_time || '')
    .replace(/{trip_date}/g, new Date(manifest.trip_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }))
}

/**
 * Get pending scheduled messages ready to send
 */
async function getPendingMessages() {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('scheduled_jobs')
    .select(`
      *,
      passengers (
        full_name,
        manifests (
          manifest_reference
        )
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_time', now)
    .order('scheduled_time', { ascending: true })

  if (error) {
    console.error('Error fetching pending messages:', error)
    return []
  }

  return data || []
}

/**
 * Mark message as sent
 */
async function markMessageAsSent(messageId) {
  const { error } = await supabase
    .from('scheduled_jobs')
    .update({
      status: 'sent',
      executed_at: new Date().toISOString()
    })
    .eq('id', messageId)

  if (error) {
    const { error: deleteError } = await supabase
      .from('scheduled_jobs')
      .delete()
      .eq('id', messageId)

    if (deleteError) {
      console.error('Error marking/deleting sent message:', error, deleteError)
    }
  }
}

/**
 * Mark message as failed
 */
async function markMessageAsFailed(messageId, errorMessage) {
  const { error } = await supabase
    .from('scheduled_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage
    })
    .eq('id', messageId)

  if (error) {
    console.error('Error marking message as failed:', error)
  }
}

/**
 * Process all due scheduled jobs (pending and <= now)
 */
export async function processDueScheduledJobs() {
  const rpcResults = await processDueScheduledJobsViaRpc()
  if (rpcResults.success) {
    return rpcResults
  }

  const dueMessages = await getPendingMessages()

  const results = {
    mode: 'client-fallback',
    processed: 0,
    sent: 0,
    failed: 0,
    total: dueMessages.length
  }

  for (const message of dueMessages) {
    try {
      results.processed++

      const sendResult = await sendTermiiSMS(
        message.phone_number,
        message.message_content,
        message.passenger_id,
        message.recipient_type
      )

      if (sendResult.success) {
        await markMessageAsSent(message.id)
        results.sent++
      } else {
        await markMessageAsFailed(message.id, sendResult.error || 'Unknown send error')
        results.failed++
      }
    } catch (err) {
      await markMessageAsFailed(message.id, err.message)
      results.failed++
    }
  }

  return results
}

/**
 * Run due jobs through Supabase RPC (preferred for background-safe execution)
 */
export async function processDueScheduledJobsViaRpc() {
  try {
    const { data, error } = await supabase.rpc('process_due_scheduled_jobs')

    if (error) {
      return {
        success: false,
        error: error.message
      }
    }

    return {
      success: true,
      mode: 'rpc',
      processed: data?.processed || 0,
      sent: data?.sent || 0,
      failed: data?.failed || 0,
      email_sent: data?.email_sent || 0,
      email_failed: data?.email_failed || 0,
      total: data?.total || 0
    }
  } catch (err) {
    return {
      success: false,
      error: err.message
    }
  }
}

