import { supabase } from './supabase'

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

/**
 * Create scheduled SMS for a manifest
 */
export async function scheduleMessagesForManifest(manifest, passengers, route) {
  try {
    // Get active schedule rules
    const { data: rules, error: rulesError } = await supabase
      .from('sms_schedule_rules')
      .select(`
        *,
        sms_templates (*)
      `)
      .eq('is_active', true)

    if (rulesError) throw rulesError

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
      for (const rule of rules) {
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
            rule.sms_templates?.message_content || rule.rule_name,
            passenger,
            manifest,
            route
          )

          scheduledMessages.push({
            manifest_id: manifest.id,
            passenger_id: passenger.id,
            schedule_rule_id: rule.id,
            recipient_type: rule.recipient_type,
            phone_number: phone,
            message_content: messageContent,
            scheduled_time: scheduledTime.toISOString(),
            status: 'pending'
          })
        }
      }
    }

    // Insert all scheduled messages
    const { data, error } = await supabase
      .from('scheduled_sms')
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
function generateMessageFromTemplate(template, passenger, manifest, route) {
  if (!template) {
    return `Dear ${passenger.full_name}, your journey from ${route.departure_location} to ${route.destination} is underway. You are covered by travel insurance.`
  }

  return template
    .replace(/{passenger_name}/g, passenger.full_name)
    .replace(/{next_of_kin_name}/g, passenger.next_of_kin_name)
    .replace(/{departure}/g, route.departure_location)
    .replace(/{destination}/g, route.destination)
    .replace(/{company}/g, manifest.company_name || 'Transport Company')
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
export async function getPendingMessages() {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('scheduled_sms')
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
export async function markMessageAsSent(messageId) {
  const { error } = await supabase
    .from('scheduled_sms')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString()
    })
    .eq('id', messageId)

  if (error) {
    console.error('Error marking message as sent:', error)
  }
}

/**
 * Mark message as failed
 */
export async function markMessageAsFailed(messageId, errorMessage) {
  const { error } = await supabase
    .from('scheduled_sms')
    .update({
      status: 'failed',
      error_message: errorMessage
    })
    .eq('id', messageId)

  if (error) {
    console.error('Error marking message as failed:', error)
  }
}