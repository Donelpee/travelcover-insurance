import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { ArrowLeft, FileText, Users, Truck, MapPin, Calendar, Clock } from 'lucide-react'
import { error } from '../utils/notifications'

export default function ManifestDetails() {
  const { manifestId } = useParams()
  const navigate = useNavigate()
  const [manifest, setManifest] = useState(null)
  const [passengers, setPassengers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchManifestDetails()
  }, [manifestId])

  async function fetchManifestDetails() {
    try {
      const { data: manifestData, error: manifestError } = await supabase
        .from('manifests')
        .select(`
          *,
          transport_companies (company_name, phone_number),
          routes (route_name, departure_location, destination, duration_hours)
        `)
        .eq('id', manifestId)
        .single()

      if (manifestError) throw manifestError
      setManifest(manifestData)

      const { data: passengersData, error: passengersError } = await supabase
        .from('passengers')
        .select('*')
        .eq('manifest_id', manifestId)

      if (passengersError) throw passengersError
      setPassengers(passengersData || [])
      
      setLoading(false)
    } catch (err) {
      console.error('Error loading manifest:', err)
      error('Error loading manifest', err.message)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!manifest) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Manifest not found</p>
        <button
          onClick={() => navigate('/manifests')}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          ← Back to Manifests
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/manifests')}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Manifests
        </button>
        <h2 className="text-3xl font-bold text-gray-800">Manifest Details</h2>
      </div>

      {/* Manifest Information */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center mb-4">
          <FileText className="text-blue-600 mr-3" size={28} />
          <div>
            <h3 className="text-2xl font-semibold">{manifest.manifest_reference}</h3>
            <p className="text-sm text-gray-500">
              Created on {new Date(manifest.created_at).toLocaleDateString()} at{' '}
              {new Date(manifest.created_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-4">
            <div className="flex items-start">
              <Truck className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-xs text-gray-500 uppercase">Transport Company</p>
                <p className="font-semibold">{manifest.transport_companies?.company_name}</p>
                {manifest.transport_companies?.phone_number && (
                  <p className="text-sm text-gray-600">{manifest.transport_companies.phone_number}</p>
                )}
              </div>
            </div>

            <div className="flex items-start">
              <MapPin className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-xs text-gray-500 uppercase">Route</p>
                <p className="font-semibold">
                  {manifest.routes?.departure_location} → {manifest.routes?.destination}
                </p>
                <p className="text-sm text-gray-600">{manifest.routes?.route_name}</p>
                {manifest.routes?.duration_hours && (
                  <p className="text-sm text-gray-600">Duration: {manifest.routes.duration_hours} hours</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start">
              <Calendar className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-xs text-gray-500 uppercase">Trip Date</p>
                <p className="font-semibold">
                  {manifest.trip_date ? new Date(manifest.trip_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : 'N/A'}
                </p>
              </div>
            </div>

            {manifest.departure_time && (
              <div className="flex items-start">
                <Clock className="text-gray-400 mr-3 mt-1" size={20} />
                <div>
                  <p className="text-xs text-gray-500 uppercase">Departure Time</p>
                  <p className="font-semibold">{manifest.departure_time}</p>
                </div>
              </div>
            )}

            <div className="flex items-start">
              <Users className="text-gray-400 mr-3 mt-1" size={20} />
              <div>
                <p className="text-xs text-gray-500 uppercase">Total Passengers</p>
                <p className="font-semibold">{manifest.total_passengers}</p>
              </div>
            </div>
          </div>
        </div>

        {manifest.image_url && (
          <div className="mt-6">
            <p className="text-xs text-gray-500 uppercase mb-2">Manifest Image</p>
            <img
              src={manifest.image_url}
              alt="Manifest"
              className="max-w-md rounded-lg border"
            />
          </div>
        )}
      </div>

      {/* Passengers List */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center">
          <Users className="mr-2 text-blue-600" size={24} />
          Passengers ({passengers.length})
        </h3>

        {passengers.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No passengers recorded</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Full Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next of Kin</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">NOK Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">NOK Email</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {passengers.map((passenger, index) => (
                  <tr key={passenger.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{passenger.full_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{passenger.phone_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{passenger.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{passenger.next_of_kin_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{passenger.next_of_kin_phone}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{passenger.next_of_kin_email || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}