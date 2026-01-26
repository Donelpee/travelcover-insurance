import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { FileText, Eye, Trash2, Users, Calendar, Truck } from 'lucide-react'
import { success, error } from '../utils/notifications'

export default function ManifestsHistory() {
  const [manifests, setManifests] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchManifests()
  }, [])

  async function fetchManifests() {
    try {
      const { data, error: fetchError } = await supabase
        .from('manifests')
        .select(`
          *,
          transport_companies (company_name),
          routes (route_name, departure_location, destination)
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setManifests(data || [])
      setLoading(false)
    } catch (err) {
      console.error('Error fetching manifests:', err)
      error('Error loading manifests')
      setLoading(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this manifest? This will also delete all associated passengers and SMS logs.')) {
      return
    }

    try {
      const { error: deleteError } = await supabase
        .from('manifests')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('Manifest deleted!')
      fetchManifests()
    } catch (err) {
      console.error('Error deleting manifest:', err)
      error('Error deleting manifest', err.message)
    }
  }

  function viewDetails(manifestId) {
    navigate(`/manifest-details/${manifestId}`)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800">Manifests History</h2>
        <button
          onClick={() => navigate('/capture-manifest')}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
        >
          + New Manifest
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : manifests.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FileText size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No Manifests Yet</h3>
          <p className="text-gray-500 mb-6">Create your first manifest to get started</p>
          <button
            onClick={() => navigate('/capture-manifest')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Create First Manifest
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {manifests.map((manifest) => (
            <div key={manifest.id} className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center mb-3">
                    <FileText className="text-blue-600 mr-3" size={24} />
                    <div>
                      <h3 className="text-lg font-semibold">{manifest.manifest_reference}</h3>
                      <p className="text-sm text-gray-500">
                        Created {new Date(manifest.created_at).toLocaleDateString()} at{' '}
                        {new Date(manifest.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="flex items-center text-gray-600">
                      <Truck size={18} className="mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Company</p>
                        <p className="text-sm font-semibold">
                          {manifest.transport_companies?.company_name || 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center text-gray-600">
                      <FileText size={18} className="mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Route</p>
                        <p className="text-sm font-semibold">
                          {manifest.routes?.departure_location} → {manifest.routes?.destination}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center text-gray-600">
                      <Calendar size={18} className="mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Trip Date</p>
                        <p className="text-sm font-semibold">
                          {manifest.trip_date ? new Date(manifest.trip_date).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center text-gray-600">
                      <Users size={18} className="mr-2" />
                      <div>
                        <p className="text-xs text-gray-500">Passengers</p>
                        <p className="text-sm font-semibold">{manifest.total_passengers}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => viewDetails(manifest.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="View Details"
                  >
                    <Eye size={20} />
                  </button>
                  <button
                    onClick={() => handleDelete(manifest.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}