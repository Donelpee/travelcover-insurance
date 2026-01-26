import { supabase } from './supabase'

const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN
const TWILIO_PHONE_NUMBER = import.meta.env.VITE_TWILIO_PHONE_NUMBER

/**
 * Send SMS via Twilio REST API
 */
export async function sendTwilioSMS(to, message, passengerId = null, recipientType = 'passenger') {
  try {
    // Format phone number (Twilio requires E.164 format: +[country code][number])
    let formattedPhone = to.trim()
    
    // If Nigerian number without country code, add +234
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+234' + formattedPhone.substring(1)
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+234' + formattedPhone
    }

    console.log('Sending SMS to:', formattedPhone)

    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    
    const formData = new URLSearchParams()
    formData.append('To', formattedPhone)
    formData.append('From', TWILIO_PHONE_NUMBER)
    formData.append('Body', message)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    })
    
    const data = await response.json()
    
    if (response.ok) {
      console.log('SMS sent successfully:', data.sid)
      
      // Log to database
      if (passengerId) {
        await supabase.from('sms_logs').insert([{
          passenger_id: passengerId,
          recipient_type: recipientType,
          phone_number: formattedPhone,
          message_content: message,
          status: 'sent',
          provider: 'twilio',
          provider_message_id: data.sid,
          sent_at: new Date().toISOString()
        }])
      }
      
      return {
        success: true,
        messageId: data.sid,
        status: data.status,
        phone: formattedPhone
      }
    } else {
      throw new Error(data.message || 'SMS sending failed')
    }
  } catch (error) {
    console.error('Twilio SMS Error:', error)
    
    // Log failure to database
    if (passengerId) {
      await supabase.from('sms_logs').insert([{
        passenger_id: passengerId,
        recipient_type: recipientType,
        phone_number: to,
        message_content: message,
        status: 'failed',
        provider: 'twilio',
        error_message: error.message,
        sent_at: new Date().toISOString()
      }])
    }
    
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Send bulk SMS to passengers and next of kin
 */
export async function sendBulkSMSTwilio(passengers, manifestData) {
  const results = {
    sent: 0,
    failed: 0,
    total: 0,
    details: []
  }

  for (const passenger of passengers) {
    // Send to passenger
    results.total++
    const passengerMessage = generatePassengerMessage(passenger, manifestData)
    
    const passengerResult = await sendTwilioSMS(
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
    const nokMessage = generateNextOfKinMessage(passenger, manifestData)
    
    const nokResult = await sendTwilioSMS(
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

    // Small delay to avoid rate limiting (Twilio allows 1 msg/second on free tier)
    await new Promise(resolve => setTimeout(resolve, 1100))
  }

  return results
}

/**
 * Generate passenger message
 */
function generatePassengerMessage(passenger, manifestData) {
  return `Dear ${passenger.full_name},

Safe journey from ${manifestData.departure} to ${manifestData.destination} with ${manifestData.company}.

Trip Date: ${new Date(manifestData.trip_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })}

You are covered by TravelGuard Insurance throughout your journey.

Emergency Contact: +234 800 000 0000

Safe travels!`
}

/**
 * Generate next of kin message
 */
function generateNextOfKinMessage(passenger, manifestData) {
  return `Hello ${passenger.next_of_kin_name},

${passenger.full_name} is traveling from ${manifestData.departure} to ${manifestData.destination} on ${new Date(manifestData.trip_date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })} with ${manifestData.company}.

They are covered by travel insurance throughout their journey.

For inquiries: +234 800 000 0000`
}

/**
 * Send WhatsApp message via Twilio (requires WhatsApp Business approval)
 */
export async function sendTwilioWhatsApp(to, message) {
  try {
    // WhatsApp requires prior approval and sandbox setup
    // For now, this is a placeholder
    
    console.warn('WhatsApp messaging requires Twilio WhatsApp Business approval')
    
    return {
      success: false,
      error: 'WhatsApp not yet configured. Please complete Twilio WhatsApp sandbox setup.'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}