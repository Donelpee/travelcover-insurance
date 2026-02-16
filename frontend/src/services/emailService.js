import { supabase } from './supabase'

/**
 * Get active email template by type
 */
export async function getTemplateByType(templateType) {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_type', templateType)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching template:', error)
    return null
  }
}

/**
 * Get all active templates
 */
export async function getActiveTemplates() {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('is_active', true)
      .order('template_name', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error fetching templates:', error)
    return []
  }
}

/**
 * Get specific template by ID
 */
export async function getTemplateById(templateId) {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error fetching template:', error)
    return null
  }
}

/**
 * Replace placeholders in template with actual data
 */
function replacePlaceholders(text, data) {
  let result = text
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{${key}}`, 'g')
    result = result.replace(regex, data[key] || '')
  })
  return result
}

/**
 * Render email template with passenger data
 */
export function renderTemplate(template, passenger, manifestData, recipientType = 'passenger') {
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
        ? `${passenger.full_name || 'The passenger'} is approximately 30 minutes from arrival at ${manifestData.destination || 'the destination'}. TravelCover support remains active until trip completion.`
        : `You are approximately 30 minutes from arrival at ${manifestData.destination || 'your destination'}. Your TravelCover protection remains active until trip completion.`)
      : (isNextOfKin
        ? `${passenger.full_name || 'The passenger'} has departed from ${manifestData.departure || 'departure point'} to ${manifestData.destination || 'destination'}. TravelCover protection is active for this trip.`
        : `Your journey from ${manifestData.departure || 'departure point'} to ${manifestData.destination || 'destination'} has departed and your TravelCover protection is active.`)
  )

  const data = {
    recipient_name: isNextOfKin
      ? (passenger.next_of_kin_name || passenger.full_name || 'Next of Kin')
      : (passenger.full_name || 'Passenger'),
    passenger_name: passenger.full_name,
    next_of_kin_name: passenger.next_of_kin_name,
    company: manifestData.company,
    departure: manifestData.departure,
    destination: manifestData.destination,
    manifest_reference: manifestData.manifest_reference || 'N/A',
    support_phone: '+234 800 000 0000',
    notification_stage: notificationStage,
    stage_label: stageLabel,
    stage_message: stageMessage,
    trip_date: new Date(manifestData.trip_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return {
    subject: replacePlaceholders(template.subject, data),
    body: replacePlaceholders(template.body_html, data)
  }
}

/**
 * Send email via Resend (using Supabase RPC)
 */
export async function sendEmail(to, subject, htmlBody, passengerId, recipientType) {
  try {
    console.log('Sending email via Resend to:', to)

    const { data, error } = await supabase.rpc('send_email_via_resend', {
      to_email: to,
      email_subject: subject,
      email_html: htmlBody,
      passenger_id_param: passengerId,
      recipient_type_param: recipientType
    })

    if (error) {
      console.error('Supabase RPC Error:', error)
      return {
        success: false,
        message: error.message
      }
    }

    console.log('Email Result:', data)

    return data
  } catch (error) {
    console.error('Email Error:', error)
    return {
      success: false,
      message: error.message
    }
  }
}

/**
 * Send bulk emails to passengers and next of kin using selected template
 */
export async function sendBulkEmails(passengers, manifestData, templateId = null) {
  const results = {
    sent: 0,
    failed: 0,
    skipped: 0,
    total: 0,
    details: []
  }

  try {
    // Get templates
    let passengerTemplate, nokTemplate

    if (templateId) {
      const selectedTemplate = await getTemplateById(templateId)
      if (!selectedTemplate) {
        throw new Error('Selected template not found')
      }

      if (selectedTemplate.template_type === 'passenger') {
        passengerTemplate = selectedTemplate
        nokTemplate = await getTemplateByTypeOrGeneral('next_of_kin')
      } else if (selectedTemplate.template_type === 'next_of_kin') {
        passengerTemplate = await getTemplateByTypeOrGeneral('passenger')
        nokTemplate = selectedTemplate
      } else {
        passengerTemplate = selectedTemplate
        nokTemplate = selectedTemplate
      }
    } else {
      // Use default templates by type
      passengerTemplate = await getTemplateByTypeOrGeneral('passenger')
      nokTemplate = await getTemplateByTypeOrGeneral('next_of_kin')
    }

    if (!passengerTemplate || !nokTemplate) {
      throw new Error('Missing active email templates in Admin Settings (passenger/next_of_kin/general)')
    }

    for (const passenger of passengers) {
      // Send to passenger if email provided
      if (passenger.email) {
        results.total++
        
        const rendered = renderTemplate(passengerTemplate, passenger, manifestData, 'passenger')
        
        const result = await sendEmail(
          passenger.email,
          rendered.subject,
          rendered.body,
          passenger.id,
          'passenger'
        )

        if (result.success) {
          results.sent++
          results.details.push({
            recipient: passenger.full_name,
            email: passenger.email,
            type: 'passenger',
            status: 'sent'
          })
        } else {
          results.failed++
          results.details.push({
            recipient: passenger.full_name,
            email: passenger.email,
            type: 'passenger',
            status: 'failed',
            error: result.message
          })
        }
      } else {
        results.skipped++
      }

      // Send to next of kin if email provided
      if (passenger.next_of_kin_email) {
        results.total++
        
        const rendered = renderTemplate(nokTemplate, passenger, manifestData, 'next_of_kin')
        
        const result = await sendEmail(
          passenger.next_of_kin_email,
          rendered.subject,
          rendered.body,
          passenger.id,
          'next_of_kin'
        )

        if (result.success) {
          results.sent++
          results.details.push({
            recipient: passenger.next_of_kin_name,
            email: passenger.next_of_kin_email,
            type: 'next_of_kin',
            status: 'sent'
          })
        } else {
          results.failed++
          results.details.push({
            recipient: passenger.next_of_kin_name,
            email: passenger.next_of_kin_email,
            type: 'next_of_kin',
            status: 'failed',
            error: result.message
          })
        }
      } else {
        results.skipped++
      }

      // Small delay between emails
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return results
  } catch (error) {
    console.error('Error in sendBulkEmails:', error)
    throw error
  }
}

/**
 * Fallback passenger email template (if no template in database)
 */
function generateFallbackPassengerEmail() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🛡️ TravelCover Insurance</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #2563eb; margin-top: 0;">Hello {passenger_name},</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #333333;">
                Your trip from <strong>{departure}</strong> to <strong>{destination}</strong> with <strong>{company}</strong> is active and covered.
              </p>
              <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 25px 0; border-radius: 5px;">
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #1e40af;"><strong>Trip Date:</strong> {trip_date}</p>
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #1e40af;"><strong>Route:</strong> {departure} → {destination}</p>
                <p style="margin: 0; font-size: 15px; color: #1e40af;"><strong>Reference:</strong> {manifest_reference}</p>
              </div>
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 5px;">
                <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Emergency Contact:</strong> {support_phone}</p>
              </div>
              <p style="font-size: 14px; color: #666666; margin-top: 30px;">
                Best regards,<br>
                <strong style="color: #2563eb;">TravelCover Insurance Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                © 2026 TravelCover Insurance. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

/**
 * Fallback next of kin email template (if no template in database)
 */
function generateFallbackNextOfKinEmail() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🛡️ TravelCover Insurance</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #059669; margin-top: 0;">Hello {next_of_kin_name},</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #333333;">
                This is a journey update for <strong>{passenger_name}</strong>, traveling from <strong>{departure}</strong> to <strong>{destination}</strong> with <strong>{company}</strong>.
              </p>
              <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 25px 0; border-radius: 5px;">
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #065f46;"><strong>Travel Date:</strong> {trip_date}</p>
                <p style="margin: 0 0 8px 0; font-size: 15px; color: #065f46;"><strong>Route:</strong> {departure} → {destination}</p>
                <p style="margin: 0; font-size: 15px; color: #065f46;"><strong>Reference:</strong> {manifest_reference}</p>
              </p>
              <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 25px 0; border-radius: 5px;">
                <p style="margin: 0; font-size: 14px; color: #1e40af;"><strong>Support Contact:</strong> {support_phone}</p>
              </div>
              <p style="font-size: 14px; color: #666666; margin-top: 30px;">
                Best regards,<br>
                <strong style="color: #059669;">TravelCover Insurance Team</strong>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                © 2026 TravelCover Insurance. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

async function getTemplateByTypeOrGeneral(templateType) {
  const exact = await getTemplateByType(templateType)
  if (exact) return exact
  return getTemplateByType('general')
}