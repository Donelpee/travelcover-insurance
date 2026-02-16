import { supabase } from './supabase'

function formatTripDate(tripDate) {
  if (!tripDate) return ''
  const date = new Date(tripDate)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function normalizePhoneNumber(input) {
  const value = (input || '').trim()
  if (!value) return null

  if (value.startsWith('+')) {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 10 ? `+${digits}` : null
  }

  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('234') && digits.length >= 13) return `+${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `+234${digits.slice(1)}`
  if (digits.length >= 10) return `+${digits}`

  return null
}

function applyTemplatePlaceholders(templateText, passenger, manifestData, recipientType = 'passenger') {
  const notificationStage = manifestData.notification_stage || 'departure'
  const isNextOfKin = recipientType === 'next_of_kin'
  const stageLabel = manifestData.stage_label || (
    notificationStage === 'arrival'
      ? (isNextOfKin ? 'Family Arrival Reminder' : 'Arrival Reminder')
      : (isNextOfKin ? 'Family Departure Update' : 'Departure Update')
  )
  const stageMessage = manifestData.stage_message || (
    notificationStage === 'arrival'
      ? (isNextOfKin
        ? `${passenger.full_name || 'The passenger'} is approximately 30 minutes from arrival at ${manifestData.destination || 'the destination'}.`
        : `You are approximately 30 minutes from arrival at ${manifestData.destination || 'your destination'}.`)
      : (isNextOfKin
        ? `${passenger.full_name || 'The passenger'} has departed from ${manifestData.departure || 'departure point'} to ${manifestData.destination || 'destination'}.`
        : `Your journey from ${manifestData.departure || 'departure point'} to ${manifestData.destination || 'destination'} has departed and cover is active.`)
  )

  const values = {
    passenger_name: passenger.full_name || 'Passenger',
    next_of_kin_name: passenger.next_of_kin_name || 'Next of Kin',
    company: manifestData.company || 'TravelCover',
    departure: manifestData.departure || 'Departure',
    destination: manifestData.destination || 'Destination',
    trip_date: formatTripDate(manifestData.trip_date),
    manifest_reference: manifestData.manifest_reference || 'N/A',
    support_phone: '+234 800 000 0000',
    notification_stage: notificationStage,
    stage_label: stageLabel,
    stage_message: stageMessage
  }

  return Object.entries(values).reduce((text, [key, value]) => {
    return text.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '')
  }, templateText)
}

function resolveTemplateByRecipient(templates, recipientType) {
  const exact = templates.find((template) => template.template_type === recipientType)
  if (exact?.message_content) return exact

  const general = templates.find((template) => template.template_type === 'general')
  if (general?.message_content) return general

  return null
}

async function getActiveSmsTemplates() {
  const { data, error } = await supabase
    .from('sms_templates')
    .select('id, template_name, template_type, message_content, is_active, updated_at, created_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return data || []
}

/**
 * Schedule bulk SMS for later sending
 */
export async function scheduleBulkSMS(passengers, manifestData, scheduledTime) {
  const results = {
    scheduled: 0,
    failed: 0,
    total: passengers.length * 2
  }

  try {
    for (const passenger of passengers) {
      const passengerPhone = normalizePhoneNumber(passenger.phone_number)
      const nokPhone = normalizePhoneNumber(passenger.next_of_kin_phone)

      if (!passengerPhone || !nokPhone) {
        results.failed += 2
        continue
      }

      // Schedule passenger SMS
      await supabase.from('scheduled_jobs').insert({
        manifest_id: manifestData.manifest_id || null,
        recipient_phone: passengerPhone,
        message_content: `Hello ${passenger.full_name}, your ${manifestData.departure} to ${manifestData.destination} trip with ${manifestData.company} on ${new Date(manifestData.trip_date).toLocaleDateString()} is active and insured. Ref: ${manifestData.manifest_reference || 'N/A'}. Support: +2348000000000.`,
        scheduled_time: scheduledTime,
        status: 'pending',
        recipient_type: 'passenger',
        phone_number: passengerPhone,
        passenger_id: passenger.id
      })
      results.scheduled++

      // Schedule NOK SMS
      await supabase.from('scheduled_jobs').insert({
        manifest_id: manifestData.manifest_id || null,
        recipient_phone: nokPhone,
        message_content: `Travel update: ${passenger.full_name} is on trip ${manifestData.departure} to ${manifestData.destination} with ${manifestData.company} on ${new Date(manifestData.trip_date).toLocaleDateString()}. Insurance is active. Ref: ${manifestData.manifest_reference || 'N/A'}. Support: +2348000000000.`,
        scheduled_time: scheduledTime,
        status: 'pending',
        recipient_type: 'next_of_kin',
        phone_number: nokPhone,
        passenger_id: passenger.id
      })
      results.scheduled++
    }

    return results
  } catch (error) {
    console.error('Error scheduling SMS:', error)
    throw error
  }
}
/**
 * Send single SMS via Termii (using Supabase RPC)
 */
export async function sendTermiiSMS(to, message, passengerId = null, recipientType = 'passenger') {
  try {
    console.log('Sending SMS via Termii to:', to)

    const { data, error } = await supabase.rpc('send_sms_via_termii', {
      phone_number: to,
      message_text: message,
      passenger_id_param: passengerId,
      recipient_type_param: recipientType
    })

    if (error) {
      console.error('Supabase RPC Error:', error)
      return {
        success: false,
        error: error.message
      }
    }

    console.log('SMS Result:', data)

    return data
  } catch (error) {
    console.error('SMS Error:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Send bulk SMS to passengers immediately
 */
export async function sendBulkSMS(passengers, manifestData) {
  const results = {
    sent: 0,
    failed: 0,
    total: 0,
    details: []
  }

  let templates = []
  try {
    templates = await getActiveSmsTemplates()
  } catch (templateError) {
    return {
      sent: 0,
      failed: passengers.length * 2,
      total: passengers.length * 2,
      details: passengers.flatMap((passenger) => ([
        {
          recipient: passenger.full_name,
          phone: passenger.phone_number,
          type: 'passenger',
          status: 'failed',
          error: `Could not load SMS templates: ${templateError.message}`
        },
        {
          recipient: passenger.next_of_kin_name,
          phone: passenger.next_of_kin_phone,
          type: 'next_of_kin',
          status: 'failed',
          error: `Could not load SMS templates: ${templateError.message}`
        }
      ]))
    }
  }

  const passengerTemplate = resolveTemplateByRecipient(templates, 'passenger')
  const nextOfKinTemplate = resolveTemplateByRecipient(templates, 'next_of_kin')

  for (const passenger of passengers) {
    const passengerPhone = normalizePhoneNumber(passenger.phone_number)
    const nokPhone = normalizePhoneNumber(passenger.next_of_kin_phone)

    // Send to passenger
    results.total++

    if (!passengerPhone) {
      results.failed++
      results.details.push({
        recipient: passenger.full_name,
        phone: passenger.phone_number,
        type: 'passenger',
        status: 'failed',
        error: 'Invalid passenger phone format'
      })
    } else if (!passengerTemplate) {
      results.failed++
      results.details.push({
        recipient: passenger.full_name,
        phone: passenger.phone_number,
        type: 'passenger',
        status: 'failed',
        error: 'No active SMS template found for passenger/general'
      })
    } else {
      const passengerMessage = applyTemplatePlaceholders(passengerTemplate.message_content, passenger, manifestData, 'passenger')

      const passengerResult = await sendTermiiSMS(
        passengerPhone,
        passengerMessage,
        passenger.id,
        'passenger'
      )

      if (passengerResult.success) {
        results.sent++
        results.details.push({
          recipient: passenger.full_name,
          phone: passengerResult.phone,
          type: 'passenger',
          status: 'sent'
        })
      } else {
        results.failed++
        results.details.push({
          recipient: passenger.full_name,
          phone: passenger.phone_number,
          type: 'passenger',
          status: 'failed',
          error: passengerResult.error
        })
      }
    }

    // Send to next of kin
    results.total++

    if (!nokPhone) {
      results.failed++
      results.details.push({
        recipient: passenger.next_of_kin_name,
        phone: passenger.next_of_kin_phone,
        type: 'next_of_kin',
        status: 'failed',
        error: 'Invalid next of kin phone format'
      })
    } else if (!nextOfKinTemplate) {
      results.failed++
      results.details.push({
        recipient: passenger.next_of_kin_name,
        phone: passenger.next_of_kin_phone,
        type: 'next_of_kin',
        status: 'failed',
        error: 'No active SMS template found for next_of_kin/general'
      })
    } else {
      const nokMessage = applyTemplatePlaceholders(nextOfKinTemplate.message_content, passenger, manifestData, 'next_of_kin')

      const nokResult = await sendTermiiSMS(
        nokPhone,
        nokMessage,
        passenger.id,
        'next_of_kin'
      )

      if (nokResult.success) {
        results.sent++
        results.details.push({
          recipient: passenger.next_of_kin_name,
          phone: nokResult.phone,
          type: 'next_of_kin',
          status: 'sent'
        })
      } else {
        results.failed++
        results.details.push({
          recipient: passenger.next_of_kin_name,
          phone: passenger.next_of_kin_phone,
          type: 'next_of_kin',
          status: 'failed',
          error: nokResult.error
        })
      }
    }

    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return results
}