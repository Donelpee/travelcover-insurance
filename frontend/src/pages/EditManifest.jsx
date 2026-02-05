import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { Plus, Trash2, Save, Users } from 'lucide-react'
import { success, error } from '../utils/notifications'

// Schedule automated jobs
async function scheduleAutomatedJobs(manifestId, tripDate) {
  try {
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('is_active', true)

    if (rulesError) {
      console.error('Error fetching automation rules:', rulesError)
      return
    }

    if (!rules || rules.length === 0) {
      console.log('No active automation rules found')
      return
    }

    const tripDateTime = new Date(tripDate)
    const jobsToInsert = []

    for (const rule of rules) {
      let scheduledTime = new Date(tripDateTime)
      
      if (rule.trigger_type === 'before_trip') {
        scheduledTime.setHours(scheduledTime.getHours() - rule.trigger_offset_hours)
      } else if (rule.trigger_type === 'trip_start') {
        // Send at trip time
      } else if (rule.trigger_type === 'trip_end') {
        scheduledTime.setHours(scheduledTime.getHours() + 8) // Assume 8hr trip
      } else if (rule.trigger_type === 'after_trip') {
        scheduledTime.setHours(scheduledTime.getHours() + rule.trigger_offset_hours)
      }

      jobsToInsert.push({
        manifest_id: manifestId,
        automation_rule_id: rule.id,
        scheduled_time: scheduledTime.toISOString(),
        status: 'pending'
      })
    }

    const { error: insertError } = await supabase
      .from('scheduled_jobs')
      .insert(jobsToInsert)

    if (insertError) {
      console.error('Error scheduling jobs:', insertError)
    } else {
      console.log(`Scheduled ${jobsToInsert.length} automated jobs`)
    }
  } catch (error) {
    console.error('Error scheduling automated jobs:', error)
  }
}

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
    departure_time: ''
  })
  const [saving, setSaving] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)

  useEffect(() => {
    fetchCompanies()
    fetchRoutes()
    
    if (location.state?.passengers) {
      setPassengers(location.state.passengers)
    }
    
    // Check if we have an image from capture
    if (location.state?.hasImage) {
      // Try to get image from sessionStorage
      const storedImage = sessionStorage.getItem('capturedImage')
      if (storedImage) {
        setCapturedImage(storedImage)
      }
    }
    
    // Clean up sessionStorage when component unmounts
    return () => {
      sessionStorage.removeItem('capturedImage')
      sessionStorage.removeItem('capturedImageTimestamp')
    }
  }, [location.state])

  async function fetchCompanies() {
    try {
      const { data, error } = await supabase
        .from('transport_companies')
        .select('*')
        .eq('status', 'active')
        .order('company_name')
      
      if (error) throw error
      setCompanies(data || [])
    } catch (err) {
      console.error('Error fetching companies:', err)
      error('Error loading companies', 'Please try again later')
    }
  }

  async function fetchRoutes() {
    try {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .eq('status', 'active')
        .order('route_name')
      
      if (error) throw error
      setRoutes(data || [])
    } catch (err) {
      console.error('Error fetching routes:', err)
      error('Error loading routes', 'Please try again later')
    }
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
    const count = prompt('How many passengers do you want to add?', '5')
    if (count && !isNaN(count) && count > 0) {
      const newPassengers = []
      for (let i = 0; i < parseInt(count); i++) {
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
    }
  }

  function deletePassenger(index) {
    if (window.confirm('Remove this passenger?')) {
      setPassengers(passengers.filter((_, i) => i !== index))
    }
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

  async function uploadImageToStorage(imageBase64, manifestRef) {
    try {
      // Convert Base64 to Blob
      const response = await fetch(imageBase64)
      const blob = await response.blob()
      
      const fileName = `manifest_${manifestRef}_${Date.now()}.jpg`
      
      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('manifest-images') // Make sure this bucket exists in Supabase
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (uploadError) {
        console.error('Error uploading image:', uploadError)
        return null
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('manifest-images')
        .getPublicUrl(fileName)
      
      return urlData.publicUrl
    } catch (err) {
      console.error('Error in image upload:', err)
      return null
    }
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

    // Validate all passengers
    for (let i = 0; i < passengers.length; i++) {
      const passenger = passengers[i]
      if (!passenger.full_name || !passenger.phone_number || !passenger.next_of_kin_name || !passenger.next_of_kin_phone) {
        error(`Passenger ${i + 1} incomplete`, 'Name, Phone, Next of Kin Name & Phone are required')
        return
      }
    }

    setSaving(true)

    try {
      const manifestRef = `MAN-${Date.now()}`
      let imageUrl = ''

      // Upload image if exists
      if (capturedImage) {
        imageUrl = await uploadImageToStorage(capturedImage, manifestRef)
      }

      // Insert manifest
      const { data: manifest, error: manifestError } = await supabase
        .from('manifests')
        .insert([{
          manifest_reference: manifestRef,
          company_id: manifestData.company_id,
          route_id: manifestData.route_id,
          trip_date: manifestData.trip_date,
          departure_time: manifestData.departure_time,
          total_passengers: passengers.length,
          image_url: imageUrl || null,
          extraction_method: capturedImage ? 'ocr' : 'manual',
          processed_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (manifestError) throw manifestError

      // Insert passengers
      const passengersToInsert = passengers.map(p => ({
        manifest_id: manifest.id,
        full_name: p.full_name,
        phone_number: p.phone_number,
        email: p.email || null,
        next_of_kin_name: p.next_of_kin_name,
        next_of_kin_phone: p.next_of_kin_phone,
        next_of_kin_email: p.next_of_kin_email || null,
        confidence_score: p.confidence_score
      }))

      const { error: passengersError } = await supabase
        .from('passengers')
        .insert(passengersToInsert)

      if (passengersError) throw passengersError

      // Schedule automated jobs
      await scheduleAutomatedJobs(manifest.id, manifestData.trip_date)

      success('Manifest saved successfully!', `${passengers.length} passenger${passengers.length === 1 ? '' : 's'} recorded`)
      
      // Navigate with only serializable data
      navigate('/send-sms', { 
        state: { 
          manifestId: manifest.id,
          passengersCount: passengers.length
        } 
      })

    } catch (err) {
      console.error('Error saving manifest:', err)
      error('Error saving manifest', err.message || 'Please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-8">Edit Manifest Data</h2>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
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

      <div className="bg-white rounded-lg shadow p-6 mb-6">
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
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={18} />
              <span>Add One</span>
            </button>
            <button
              onClick={addMultiplePassengers}
              className="bg-green-600 text-white px-5 py-2.5 rounded-lg flex items-center space-x-2 hover:bg-green-700 transition-colors shadow-sm"
            >
              <Plus size={18} />
              <span>Add Multiple</span>
            </button>
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
                  className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
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
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
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
          className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-lg hover:bg-gray-200 font-medium transition-colors"
        >
          ← Back to Capture
        </button>
        <button
          onClick={saveManifest}
          disabled={saving || passengers.length === 0}
          className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3.5 rounded-lg hover:from-green-700 hover:to-green-800 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg transition-all"
        >
          <Save size={20} />
          <span>{saving ? 'Saving...' : 'Save & Continue to SMS'}</span>
        </button>
      </div>
    </div>
  )
}