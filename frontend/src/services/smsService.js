import { supabase } from './supabase'

const SMS_API_KEY = import.meta.env.VITE_SMS_API_KEY
const SMS_API_URL = 'https://www.bulksmsnigeria.com/api/v1/sms/create'

export async function sendSMS(phoneNumber, message, passengerId, recipientType) {
  try {
    // Send SMS via Bulk SMS Nigeria API
    const response = await fetch(SMS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_token: SMS_API_KEY,
        to: phoneNumber,
        from: 'TravelGuard', // Your sender ID
        body: message,
        dnd: '2' // Deliver to DND numbers
      })
    })

    const result = await response.json()
    console.log('SMS API Response:', result)

    // Determine status
    const status = result.data?.status === 'success' || result.status === 'success' 
      ? 'sent' 
      : 'failed'
    
    const errorMessage = result.data?.message || result.message || null

    // Log to database
    const { error: logError } = await supabase
      .from('sms_logs')
      .insert([{
        passenger_id: passengerId,
        recipient_type: recipientType,
        phone_number: phoneNumber,
        message_content: message,
        status: status,
        error_message: errorMessage,
        sent_at: new Date().toISOString(),
        provider: 'bulk_sms_nigeria'
      }])

    if (logError) {
      console.error('Error logging SMS:', logError)
    }

    return {
      success: status === 'sent',
      message: result.data?.message || result.message,
      result
    }

  } catch (error) {
    console.error('Error sending SMS:', error)
    
    // Log failed attempt
    await supabase
      .from('sms_logs')
      .insert([{
        passenger_id: passengerId,
        recipient_type: recipientType,
        phone_number: phoneNumber,
        message_content: message,
        status: 'failed',
        error_message: error.message,
        sent_at: new Date().toISOString(),
        provider: 'bulk_sms_nigeria'
      }])

    return {
      success: false,
      message: error.message
    }
  }
}

export async function sendBulkSMS(passengers, manifestData) {
  const results = {
    sent: 0,
    failed: 0,
    total: passengers.length * 2, // Each passenger + next of kin
    details: []
  }

  for (const passenger of passengers) {
    // Message to passenger
    const passengerMessage = generatePassengerMessage(passenger, manifestData)
    const passengerResult = await sendSMS(
      passenger.phone_number,
      passengerMessage,
      passenger.id,
      'passenger'
    )

    if (passengerResult.success) {
      results.sent++
    } else {
      results.failed++
    }

    results.details.push({
      recipient: passenger.full_name,
      phone: passenger.phone_number,
      type: 'passenger',
      status: passengerResult.success ? 'sent' : 'failed'
    })

    // Message to next of kin
    const nextOfKinMessage = generateNextOfKinMessage(passenger, manifestData)
    const nextOfKinResult = await sendSMS(
      passenger.next_of_kin_phone,
      nextOfKinMessage,
      passenger.id,
      'next_of_kin'
    )

    if (nextOfKinResult.success) {
      results.sent++
    } else {
      results.failed++
    }

    results.details.push({
      recipient: passenger.next_of_kin_name,
      phone: passenger.next_of_kin_phone,
      type: 'next_of_kin',
      status: nextOfKinResult.success ? 'sent' : 'failed'
    })

    // Small delay to avoid rate limiting (100ms)
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return results
}

function generatePassengerMessage(passenger, manifestData) {
  return `Dear ${passenger.full_name},

Safe journey on your trip from ${manifestData.departure} to ${manifestData.destination} with ${manifestData.company} on ${formatDate(manifestData.trip_date)}.

You are covered by TravelGuard Insurance throughout your journey.

Emergency: +234 800 000 0000`
}

function generateNextOfKinMessage(passenger, manifestData) {
  return `Hello ${passenger.next_of_kin_name},

${passenger.full_name} is traveling from ${manifestData.departure} to ${manifestData.destination} on ${formatDate(manifestData.trip_date)} with ${manifestData.company}.

They are covered by travel insurance.

For inquiries: +234 800 000 0000`
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
}