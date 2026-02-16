import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { Plus, Trash2, Save, Users } from 'lucide-react'
import { success, error, warning, confirm as confirmToast } from '../utils/notifications'
import { sendImmediateNotifications, scheduleManifestNotifications } from '../services/notificationService'

export default function EditManifest() {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [passengers, setPassengers] = useState([])
  const [companies, setCompanies] = useState([])
  const [routes, setRoutes] = useState([])
  const [filteredRoutes, setFilteredRoutes] = useState([])
  const [manifestData, setManifestData] = useState({
    company_id: '',
    route_id: '',
    trip_date: '',
    departure_time: '',
    image_url: location.state?.imageUrl || ''
  })
  const [saving, setSaving] = useState(false)
  const [bulkAddCount, setBulkAddCount] = useState('5')
  const [sendOption, setSendOption] = useState('immediate')
  const [sendEmails, setSendEmails] = useState(true)
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')

  useEffect(() => {
    fetchCompanies()
    fetchRoutes()
    
    if (location.state?.passengers?.length) {
      const normalizedPassengers = location.state.passengers.map((passenger) => ({
        id: crypto.randomUUID(),
        full_name: passenger.full_name || '',
        phone_number: passenger.phone_number || '',
        email: passenger.email || '',
        next_of_kin_name: passenger.next_of_kin_name || '',
        next_of_kin_phone: passenger.next_of_kin_phone || '',
        next_of_kin_email: passenger.next_of_kin_email || '',
        confidence_score: passenger.confidence_score || 85
      }))
      setPassengers(normalizedPassengers)
    }
  }, [])

  async function fetchCompanies() {
    const { data } = await supabase
      .from('transport_companies')
      .select('*')
      .eq('status', 'active')
      .order('company_name')
    
    setCompanies(data || [])
  }

  async function fetchRoutes() {
    const { data } = await supabase
      .from('routes')
      .select('*')
      .eq('status', 'active')
      .order('route_name')
    
    setRoutes(data || [])
  }

  useEffect(() => {
    if (manifestData.company_id) {
      const filtered = routes.filter(r => r.company_id === manifestData.company_id)
      setFilteredRoutes(filtered)
    } else {
      setFilteredRoutes([])
    }
  }, [manifestData.company_id, routes])

  useEffect(() => {
    if (manifestData.route_id && routes.length > 0) {
      const selectedRoute = routes.find(r => r.id === manifestData.route_id)
      
      if (selectedRoute?.typical_departure_time) {
        setManifestData(prev => ({
          ...prev,
          departure_time: selectedRoute.typical_departure_time
        }))
      }
    }
  }, [manifestData.route_id, routes])

  function addPassenger() {
    setPassengers([
      ...passengers,
      {
        id: crypto.randomUUID(),
        full_name: '',
        phone_number: '',
        email: '',
        next_of_kin_name: '',
        next_of_kin_phone: '',
        next_of_kin_email: '',
        confidence_score: 100
      }
    ])
  }

  function addMultiplePassengers() {
    const count = Number.parseInt(String(bulkAddCount), 10)

    if (!Number.isInteger(count) || count <= 0 || count > 100) {
      error('Invalid count', 'Enter a number between 1 and 100')
      return
    }

    const newPassengers = []
    for (let i = 0; i < count; i++) {
      newPassengers.push({
        id: crypto.randomUUID(),
        full_name: '',
        phone_number: '',
        email: '',
        next_of_kin_name: '',
        next_of_kin_phone: '',
        next_of_kin_email: '',
        confidence_score: 100
      })
    }
    setPassengers([...passengers, ...newPassengers])
    success('Passengers added', `${count} empty passenger row${count === 1 ? '' : 's'} created`)
  }

  async function deletePassenger(index) {
    if (!(await confirmToast('Remove this passenger?', { confirmText: 'Remove' }))) {
      return
    }

    setPassengers(passengers.filter((_, i) => i !== index))
  }

  function updatePassenger(index, field, value) {
    const updated = [...passengers]
    updated[index][field] = value
    setPassengers(updated)
  }

  function getConfidenceColor(score) {
    if (score >= 90) return 'border-green-200 bg-green-50'
    if (score >= 70) return 'border-yellow-200 bg-yellow-50'
    return 'border-red-200 bg-red-50'
  }

  async function saveManifest() {
    if (!manifestData.company_id || !manifestData.route_id || !manifestData.trip_date) {
      error('Missing trip details', 'Company, Route, and Trip Date are required')
      return
    }

    if (passengers.length === 0) {
      error('No passengers added', 'Please add at least one passenger')
      return
    }

    const isValidPhone = (value) => /^\+?[0-9\s()-]{8,20}$/.test((value || '').trim())
    const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim())

    let hasError = false
    for (let i = 0; i < passengers.length; i++) {
      const passenger = passengers[i]
      if (!passenger.full_name?.trim() || !passenger.phone_number?.trim() || !passenger.next_of_kin_name?.trim() || !passenger.next_of_kin_phone?.trim()) {
        error(`Passenger ${i + 1} incomplete`, 'Name, Phone, Next of Kin Name & Phone are required')
        hasError = true
        break
      }

      if (!isValidPhone(passenger.phone_number) || !isValidPhone(passenger.next_of_kin_phone)) {
        error(`Passenger ${i + 1} invalid phone`, 'Use a valid phone number for passenger and next of kin')
        hasError = true
        break
      }

      if (passenger.email && !isValidEmail(passenger.email)) {
        error(`Passenger ${i + 1} invalid email`, 'Passenger email format is invalid')
        hasError = true
        break
      }

      if (passenger.next_of_kin_email && !isValidEmail(passenger.next_of_kin_email)) {
        error(`Passenger ${i + 1} invalid NOK email`, 'Next of kin email format is invalid')
        hasError = true
        break
      }
    }

    if (hasError) return

    if (sendOption === 'scheduled') {
      if (!scheduledDate || !scheduledTime) {
        error('Missing schedule details', 'Select scheduled date and time')
        return
      }

      const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
      if (!Number.isFinite(scheduledDateTime.getTime()) || scheduledDateTime <= new Date()) {
        error('Invalid schedule time', 'Scheduled time must be in the future')
        return
      }
    }

    setSaving(true)

    try {
      const manifestRef = `MAN-${Date.now()}`

      console.log('=== SAVING MANIFEST ===')
      console.log('Manifest Data:', manifestData)

      const departureDateTime = new Date(`${manifestData.trip_date}T${manifestData.departure_time || '00:00'}`)
      const selectedRoute = routes.find(r => r.id === manifestData.route_id)
      const durationHours = selectedRoute?.duration_hours || 8

      const arrivalDateTime = new Date(departureDateTime.getTime() + durationHours * 3600000)
      const arrivalTimeString = arrivalDateTime.toTimeString().slice(0, 5)

      const { data: manifest, error: manifestError } = await supabase
        .from('manifests')
        .insert([{
          manifest_reference: manifestRef,
          company_id: manifestData.company_id,
          route_id: manifestData.route_id,
          trip_date: manifestData.trip_date,
          departure_time: manifestData.departure_time,
          arrival_time: arrivalTimeString,
          total_passengers: passengers.length,
          image_url: manifestData.image_url,
          extraction_method: 'manual',
          processed_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (manifestError) {
        console.error('Manifest Insert Error:', manifestError)
        throw manifestError
      }

      console.log('✅ Manifest saved:', manifest.id)
      console.log('=== SAVING PASSENGERS ===')
      console.log('Passengers to insert:', passengers)

      const passengersToInsert = passengers.map(p => ({
        manifest_id: manifest.id,
        full_name: p.full_name.trim(),
        phone_number: p.phone_number.trim(),
        email: p.email?.trim() || null,
        next_of_kin_name: p.next_of_kin_name.trim(),
        next_of_kin_phone: p.next_of_kin_phone.trim(),
        next_of_kin_email: p.next_of_kin_email?.trim() || null,
        confidence_score: p.confidence_score
      }))

      console.log('Passengers payload:', passengersToInsert)

      const { data: insertedPassengers, error: passengersError } = await supabase
        .from('passengers')
        .insert(passengersToInsert)
        .select()

      if (passengersError) {
        console.error('❌ PASSENGERS INSERT ERROR:', passengersError)
        throw passengersError
      }

      console.log('✅ Passengers saved:', insertedPassengers.length)

      const selectedCompany = companies.find(c => c.id === manifestData.company_id)
      const manifestForNotification = {
        ...manifest,
        company_id: manifestData.company_id,
        route_id: manifestData.route_id,
        company_name: selectedCompany?.company_name
      }

      if (sendOption === 'scheduled') {
        const { schedulingResult } = await scheduleManifestNotifications({
          manifest: manifestForNotification,
          route: selectedRoute,
          company: selectedCompany,
          passengers: insertedPassengers,
          scheduledDate,
          scheduledTime
        })

        if ((schedulingResult?.count || 0) === 0) {
          warning('Manifest saved, but no scheduled jobs were generated', 'Open Journey Automation and verify active rules for this company/route')
        } else {
          success('Manifest saved and notifications scheduled', `Queued ${schedulingResult.count} message(s) from admin templates`) 
        }

        setSaving(false)
        navigate('/scheduled-messages')
        return
      }

      const manifestDataForTemplates = {
        company: selectedCompany?.company_name || 'TravelCover',
        departure: selectedRoute?.departure_location || 'Departure',
        destination: selectedRoute?.destination || 'Destination',
        trip_date: manifest.trip_date,
        manifest_reference: manifest.manifest_reference || 'N/A'
      }

      const { smsResults, emailResults } = await sendImmediateNotifications({
        passengers: insertedPassengers,
        company: selectedCompany,
        route: selectedRoute,
        manifest: manifestDataForTemplates,
        sendEmails,
        selectedTemplateId: null
      })

      console.log('✅ All done!')

      const smsSummary = `SMS ${smsResults?.sent || 0}/${smsResults?.total || 0}`
      const emailSummary = sendEmails && emailResults ? ` | Email ${emailResults.sent}/${emailResults.total}` : ''
      success('Manifest saved and notifications processed', smsSummary + emailSummary)

      if (smsResults?.failed === smsResults?.total) {
        const firstFailure = smsResults.details?.find(detail => detail.status === 'failed')
        warning('SMS not delivered', firstFailure?.error || 'Please verify SMS provider settings')
      }

      navigate('/')

    } catch (err) {
      console.error('❌ SAVE MANIFEST ERROR:', err)
      error('Error saving manifest', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-700 text-white p-6 shadow-lg shadow-cyan-100">
        <h2 className="text-3xl font-bold">Edit Manifest Data</h2>
        <p className="text-cyan-50 mt-2">Complete trip details, validate passengers, and prepare notifications in one flow.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Trip Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Transport Company <span className="text-red-500">*</span>
            </label>
            <select
              value={manifestData.company_id}
              onChange={(e) => setManifestData({ ...manifestData, company_id: e.target.value, route_id: '' })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="">Select Company</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.company_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Route <span className="text-red-500">*</span>
            </label>
            <select
              value={manifestData.route_id}
              onChange={(e) => setManifestData({ ...manifestData, route_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
              disabled={!manifestData.company_id}
            >
              <option value="">Select Route</option>
              {filteredRoutes.map(route => (
                <option key={route.id} value={route.id}>
                  {route.departure_location} → {route.destination}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Trip Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={manifestData.trip_date}
              onChange={(e) => setManifestData({ ...manifestData, trip_date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Departure Time</label>
            <input
              type="time"
              value={manifestData.departure_time}
              onChange={(e) => setManifestData({ ...manifestData, departure_time: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">Notification Dispatch</h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
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
              <span className="text-sm font-medium">Schedule</span>
            </label>
          </div>

          {sendOption === 'scheduled' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Scheduled Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Scheduled Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
          )}

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmails}
              onChange={(e) => setSendEmails(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Also send emails</span>
          </label>

          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            Message content comes from Admin-managed SMS and Email templates only.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex justify-between items-center mb-6 pb-4 border-b">
          <div>
            <h3 className="text-xl font-semibold flex items-center">
              <Users className="mr-2 text-blue-600" size={24} />
              Passengers List
            </h3>
            <p className="text-sm text-gray-500 mt-1">Total: {passengers.length} passengers</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={addPassenger}
              className="btn-primary px-5 py-2.5 flex items-center space-x-2"
            >
              <Plus size={18} />
              <span>Add One</span>
            </button>
            <button
              onClick={addMultiplePassengers}
              className="btn-secondary px-5 py-2.5 flex items-center space-x-2"
            >
              <Plus size={18} />
              <span>Add Multiple</span>
            </button>
            <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50">
              <label htmlFor="bulk-passenger-count" className="text-xs text-slate-600">Count</label>
              <input
                id="bulk-passenger-count"
                type="number"
                min="1"
                max="100"
                value={bulkAddCount}
                onChange={(e) => setBulkAddCount(e.target.value)}
                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-md bg-white"
              />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {passengers.map((passenger, index) => (
            <div
              key={passenger.id}
              className={`border-2 rounded-xl p-6 transition-all ${getConfidenceColor(passenger.confidence_score)}`}
            >
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-200">
                <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                  <span className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm">
                    {index + 1}
                  </span>
                  Passenger {index + 1}
                </h4>
                <button
                  onClick={() => deletePassenger(index)}
                  className="btn-icon-danger"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              <div className="mb-5">
                <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <Users size={16} className="mr-2" />
                  Passenger Information
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={passenger.full_name}
                      onChange={(e) => updatePassenger(index, 'full_name', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="e.g., John Doe"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={passenger.phone_number}
                      onChange={(e) => updatePassenger(index, 'phone_number', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="+234 800 000 0000"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Email Address <span className="text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      value={passenger.email}
                      onChange={(e) => updatePassenger(index, 'email', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <Users size={16} className="mr-2" />
                  Next of Kin Information
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Next of Kin Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={passenger.next_of_kin_name}
                      onChange={(e) => updatePassenger(index, 'next_of_kin_name', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="e.g., Jane Doe"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Next of Kin Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={passenger.next_of_kin_phone}
                      onChange={(e) => updatePassenger(index, 'next_of_kin_phone', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="+234 800 000 0000"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                      Next of Kin Email <span className="text-gray-400">(Optional)</span>
                    </label>
                    <input
                      type="email"
                      value={passenger.next_of_kin_email || ''}
                      onChange={(e) => updatePassenger(index, 'next_of_kin_email', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="jane@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {passengers.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300">
              <Users size={48} className="mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 font-medium mb-2">No passengers added yet</p>
              <p className="text-sm text-gray-500 mb-4">Click "Add One" or "Add Multiple" to start adding passengers</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex space-x-4">
        <button
          onClick={() => navigate('/capture-manifest')}
          className="btn-secondary flex-1 py-3.5"
        >
          ← Back to Capture
        </button>
        <button
          onClick={saveManifest}
          disabled={saving || passengers.length === 0}
          className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3.5 rounded-lg hover:from-green-700 hover:to-green-800 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg transition-all"
        >
          <Save size={20} />
          <span>{saving ? 'Processing...' : sendOption === 'scheduled' ? 'Save and Schedule Notifications' : 'Save and Send Notifications'}</span>
        </button>
      </div>
    </div>
  )
}