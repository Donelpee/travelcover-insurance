import { supabase } from './supabase'

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
      // Schedule passenger SMS
      await supabase.from('scheduled_messages').insert({
        recipient_phone: passenger.phone_number,
        message_content: `Dear ${passenger.full_name}, safe journey from ${manifestData.departure} to ${manifestData.destination} with ${manifestData.company}. Trip: ${manifestData.trip_date}`,
        scheduled_time: scheduledTime,
        status: 'pending',
        recipient_type: 'passenger'
      })
      results.scheduled++

      // Schedule NOK SMS
      await supabase.from('scheduled_messages').insert({
        recipient_phone: passenger.next_of_kin_phone,
        message_content: `Hello ${passenger.next_of_kin_name}, ${passenger.full_name} is traveling from ${manifestData.departure} to ${manifestData.destination}`,
        scheduled_time: scheduledTime,
        status: 'pending',
        recipient_type: 'next_of_kin'
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

  for (const passenger of passengers) {
    // Send to passenger
    results.total++
    const passengerMessage = `Dear ${passenger.full_name}, safe journey from ${manifestData.departure} to ${manifestData.destination} with ${manifestData.company}. Trip: ${new Date(manifestData.trip_date).toLocaleDateString()}. You are covered by TravelCover Insurance. Emergency: +234 800 000 0000`

    const passengerResult = await sendTermiiSMS(
      passenger.phone_number,
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

    // Send to next of kin
    results.total++
    const nokMessage = `Hello ${passenger.next_of_kin_name}, ${passenger.full_name} is traveling from ${manifestData.departure} to ${manifestData.destination} on ${new Date(manifestData.trip_date).toLocaleDateString()} with ${manifestData.company}. Covered by travel insurance. Contact: +234 800 000 0000`

    const nokResult = await sendTermiiSMS(
      passenger.next_of_kin_phone,
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

    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return results
}