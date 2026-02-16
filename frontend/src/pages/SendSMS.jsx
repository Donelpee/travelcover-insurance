import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { getActiveTemplates } from '../services/emailService'
import { sendImmediateNotifications, scheduleManifestNotifications } from '../services/notificationService'
import { getTripDurationMs } from '../utils/tripTiming'
import { Send, CheckCircle, XCircle, Loader, Users, MessageSquare, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { success, error as errorToast, warning, confirm as confirmToast } from '../utils/notifications'

export default function SendSMS() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const [manifest, setManifest] = useState(null)
  const [passengers, setPassengers] = useState([])
  const [company, setCompany] = useState(null)
  const [route, setRoute] = useState(null)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sendOption, setSendOption] = useState('immediate')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [sendEmails, setSendEmails] = useState(false)
  const [emailResults, setEmailResults] = useState(null)
  const [emailTemplates, setEmailTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    if (location.state?.manifestId) {
      fetchManifestData(location.state.manifestId)
    } else {
      errorToast('No manifest found', 'Redirecting...')
      navigate('/capture-manifest')
    }
  }, [])

  async function fetchManifestData(manifestId) {
  try {
    const { data: manifestData, error: manifestError } = await supabase
      .from('manifests')
      .select(`
        *,
        transport_companies (company_name),
        routes (route_name, departure_location, destination, duration_hours)
      `)
      .eq('id', manifestId)
      .single()

    if (manifestError) throw manifestError

    setManifest(manifestData)
    setCompany(manifestData.transport_companies)
    setRoute(manifestData.routes)

    const { data: passengersData, error: passengersError } = await supabase
      .from('passengers')
      .select('*')
      .eq('manifest_id', manifestId)

    if (passengersError) throw passengersError

    setPassengers(passengersData || [])

    const templates = await getActiveTemplates()
    setEmailTemplates(templates)
    if (templates.length > 0) {
      setSelectedTemplateId(templates[0].id)
    }

    setLoading(false)

  } catch (err) {
    console.error('Error fetching manifest:', err)
    errorToast('Error loading manifest', err.message)
    // Don't navigate away - show the error
    setLoading(false)
  }
}

  function getOverridePreview() {
    if (!scheduledDate || !scheduledTime) return null
    const newDeparture = new Date(`${scheduledDate}T${scheduledTime}`)
    if (!Number.isFinite(newDeparture.getTime())) return null

    const durationMs = getTripDurationMs(manifest, route)
    const newArrival = new Date(newDeparture.getTime() + durationMs)

    return {
      departure: newDeparture,
      arrival: newArrival
    }
  }

  async function handleSendNotifications() {
    if (!manifest || !route || !company) {
      errorToast('Missing trip details', 'Manifest, route, or company data is unavailable')
      return
    }

    if (!passengers.length) {
      warning('No passengers found for this manifest')
      return
    }

    const hasInvalidNumbers = passengers.some((passenger) => {
      const passengerPhone = passenger.phone_number?.trim()
      const nextOfKinPhone = passenger.next_of_kin_phone?.trim()
      return !passengerPhone || !nextOfKinPhone
    })

    if (hasInvalidNumbers) {
      warning('Some passengers are missing phone numbers', 'Complete passenger and next of kin phone fields before sending')
      return
    }

    if (sendOption === 'scheduled') {
      if (!scheduledDate || !scheduledTime) {
        warning('Please select date and time for scheduled message')
        return
      }

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
      
      if (scheduledDateTime <= new Date()) {
        warning('Scheduled time must be in the future')
        return
      }

      if (!(await confirmToast(`Schedule messages to be sent on ${scheduledDateTime.toLocaleString()}?`, { confirmText: 'Schedule' }))) {
        return
      }

      setSending(true)

      try {
        const { updatedManifest, schedulingResult } = await scheduleManifestNotifications({
          manifest,
          route,
          company,
          passengers,
          scheduledDate,
          scheduledTime
        })

        setManifest(updatedManifest)

        success(
          'Messages scheduled successfully!',
          `Queued ${schedulingResult.count || 0} rule-based message(s) using Journey Automation timing rules.`
        )

        setSending(false)
        
        setTimeout(() => {
          navigate('/scheduled-messages')
        }, 2000)

      } catch (err) {
        console.error('Error scheduling messages:', err)
        errorToast('Error scheduling messages', err.message)
        setSending(false)
      }
    } else {
      const totalSMS = passengers.length * 2
      const emailCount = passengers.filter(p => p.email || p.next_of_kin_email).length
      
      let confirmMessage = `Send SMS to ${passengers.length} passengers and their next of kin (${totalSMS} messages total)?`
      if (sendEmails && emailCount > 0) {
        confirmMessage += `\n\nAlso send ${emailCount} email(s) to those who provided email addresses.`
      }
      
      if (!(await confirmToast(confirmMessage.replace(/\n\n/g, ' '), { confirmText: 'Send now' }))) {
        return
      }

      setSending(true)

      try {
        const { error: clearQueueError } = await supabase
          .from('scheduled_jobs')
          .delete()
          .eq('manifest_id', manifest.id)
          .eq('status', 'pending')

        if (clearQueueError) {
          console.warn('Unable to clear pending scheduled jobs before immediate send:', clearQueueError)
        }

        const { smsResults, emailResults } = await sendImmediateNotifications({
          passengers,
          company,
          route,
          manifest,
          sendEmails,
          selectedTemplateId
        })

        setResults(smsResults)

        if (emailResults) {
          setEmailResults(emailResults)
        }

        setSending(false)

        if (smsResults.failed === smsResults.total) {
          const firstFailure = smsResults.details?.find(detail => detail.status === 'failed')
          warning(
            'No SMS was delivered',
            firstFailure?.error || 'Please verify SMS provider credentials and RPC permissions in Supabase.'
          )
        }

        const smsMessage = `SMS: ${smsResults.sent}/${smsResults.total}`
        const emailMessage = emailResults ? ` | Emails: ${emailResults.sent}/${emailResults.total}` : ''
        success('Notifications sent!', smsMessage + emailMessage)

      } catch (err) {
        console.error('Error sending notifications:', err)
        errorToast('Error sending notifications', err.message)
        setSending(false)
      }
    }
  }

  const filteredPassengers = passengers.filter((passenger) => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return true

    const text = [
      passenger.full_name,
      passenger.phone_number,
      passenger.next_of_kin_name,
      passenger.next_of_kin_phone,
      passenger.email,
      passenger.next_of_kin_email
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filteredPassengers.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const paginatedPassengers = filteredPassengers.slice(startIndex, startIndex + pageSize)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="animate-spin text-blue-600" size={48} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white p-6 shadow-lg shadow-emerald-100">
        <h2 className="text-3xl font-bold">Send Notifications</h2>
        <p className="text-emerald-50 mt-2">Review trip details, choose delivery mode, and send notifications with confidence.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Trip Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Manifest Reference</p>
            <p className="font-semibold">{manifest.manifest_reference}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Transport Company</p>
            <p className="font-semibold">{company.company_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Route</p>
            <p className="font-semibold">{route.departure_location} → {route.destination}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Trip Date</p>
            <p className="font-semibold">{new Date(manifest.trip_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Passengers</p>
            <p className="font-semibold">{passengers.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Messages</p>
            <p className="font-semibold">{passengers.length * 2} (Passengers + Next of Kin)</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center">
          <Users className="mr-2" size={24} />
          Passengers ({passengers.length})
        </h3>
        <div className="mb-4 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search passenger or next-of-kin"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Phone</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Next of Kin</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">NOK Phone</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedPassengers.map((passenger) => (
                <tr key={passenger.id}>
                  <td className="px-4 py-2 text-sm">{passenger.full_name}</td>
                  <td className="px-4 py-2 text-sm">{passenger.phone_number}</td>
                  <td className="px-4 py-2 text-sm">{passenger.next_of_kin_name}</td>
                  <td className="px-4 py-2 text-sm">{passenger.next_of_kin_phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">Showing {startIndex + 1}-{Math.min(startIndex + pageSize, filteredPassengers.length)} of {filteredPassengers.length}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              className="btn-secondary px-3 py-2 disabled:opacity-50"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage === totalPages}
              className="btn-secondary px-3 py-2 disabled:opacity-50"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Send Options</h3>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              value="immediate"
              checked={sendOption === 'immediate'}
              onChange={(e) => setSendOption(e.target.value)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Send Immediately</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="radio"
              value="scheduled"
              checked={sendOption === 'scheduled'}
              onChange={(e) => setSendOption(e.target.value)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Schedule Based on Trip Time</span>
          </label>
        </div>
        
        {sendOption === 'scheduled' && (
          <div className="mt-4">
            {getOverridePreview() && (
              <div className="mb-3 bg-indigo-50 border-l-4 border-indigo-600 p-3 rounded">
                <p className="text-sm text-indigo-900">
                  <strong>Override Preview:</strong> New departure is {getOverridePreview().departure.toLocaleString()} and auto-calculated arrival is {getOverridePreview().arrival.toLocaleString()}.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-600 p-3 rounded">
              <p className="text-sm text-blue-900">
                <strong>Smart Scheduling:</strong> Messages will be sent at the specified time.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl mb-6">
        <div className="flex items-center space-x-2 mb-3">
          <input
            type="checkbox"
            id="sendEmails"
            checked={sendEmails}
            onChange={(e) => setSendEmails(e.target.checked)}
            className="w-4 h-4 text-purple-600"
          />
          <label htmlFor="sendEmails" className="text-gray-700 font-medium">
            Also Send Emails
          </label>
        </div>

        {sendEmails && (
          <div className="mt-3 ml-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Email Template:
            </label>
            {emailTemplates.length > 0 ? (
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {emailTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.template_name} ({template.template_type})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-600 italic">
                No active email templates found. Using default template.
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2">
              💡 Manage templates in <a href="/admin-settings?tab=email-templates" className="text-purple-600 hover:underline">Admin Settings → Email Templates</a>
            </p>
          </div>
        )}
      </div>

      {!results && (
        <button
          onClick={handleSendNotifications}
          disabled={sending}
          className="w-full btn-primary py-4 text-lg font-semibold flex items-center justify-center space-x-3"
        >
          {sending ? (
            <>
              <Loader className="animate-spin" size={24} />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <Send size={24} />
              <span>{sendOption === 'scheduled' ? 'Schedule Messages' : 'Send Notifications to All'}</span>
            </>
          )}
        </button>
      )}

      {results && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <h3 className="text-xl font-semibold mb-4">SMS Sending Results</h3>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <MessageSquare className="mx-auto mb-2 text-blue-600" size={32} />
              <p className="text-2xl font-bold text-blue-600">{results.total}</p>
              <p className="text-sm text-gray-600">Total</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <CheckCircle className="mx-auto mb-2 text-green-600" size={32} />
              <p className="text-2xl font-bold text-green-600">{results.sent}</p>
              <p className="text-sm text-gray-600">Sent</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center">
              <XCircle className="mx-auto mb-2 text-red-600" size={32} />
              <p className="text-2xl font-bold text-red-600">{results.failed}</p>
              <p className="text-sm text-gray-600">Failed</p>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.details.map((detail, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded ${
                  detail.status === 'sent' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <div>
                  <p className="font-semibold">{detail.recipient}</p>
                  <p className="text-sm text-gray-600">{detail.phone} ({detail.type})</p>
                </div>
                {detail.status === 'sent' ? (
                  <CheckCircle className="text-green-600" size={20} />
                ) : (
                  <XCircle className="text-red-600" size={20} />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full mt-6 btn-primary py-3"
          >
            Back to Dashboard
          </button>
        </div>
      )}

      {emailResults && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mt-6">
          <h3 className="text-xl font-semibold mb-4">Email Sending Results</h3>
          
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <MessageSquare className="mx-auto mb-2 text-blue-600" size={32} />
              <p className="text-2xl font-bold text-blue-600">{emailResults.total}</p>
              <p className="text-sm text-gray-600">Total</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <CheckCircle className="mx-auto mb-2 text-green-600" size={32} />
              <p className="text-2xl font-bold text-green-600">{emailResults.sent}</p>
              <p className="text-sm text-gray-600">Sent</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center">
              <XCircle className="mx-auto mb-2 text-red-600" size={32} />
              <p className="text-2xl font-bold text-red-600">{emailResults.failed}</p>
              <p className="text-sm text-gray-600">Failed</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <XCircle className="mx-auto mb-2 text-gray-600" size={32} />
              <p className="text-2xl font-bold text-gray-600">{emailResults.skipped}</p>
              <p className="text-sm text-gray-600">Skipped (No Email)</p>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {emailResults.details.map((detail, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded ${
                  detail.status === 'sent' ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <div>
                  <p className="font-semibold">{detail.recipient}</p>
                  <p className="text-sm text-gray-600">{detail.email} ({detail.type})</p>
                </div>
                {detail.status === 'sent' ? (
                  <CheckCircle className="text-green-600" size={20} />
                ) : (
                  <XCircle className="text-red-600" size={20} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}