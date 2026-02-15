import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { FileText, Eye, Trash2, Users, Calendar, Truck, FolderClock, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { success, error, confirm as confirmToast } from '../utils/notifications'

export default function ManifestsHistory() {
  const [manifests, setManifests] = useState([])
  const [manifestPassengerNames, setManifestPassengerNames] = useState({})
  const [passengerSearchManifestIds, setPassengerSearchManifestIds] = useState(null)
  const [searchingPassengerNames, setSearchingPassengerNames] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const navigate = useNavigate()

  useEffect(() => {
    fetchManifests()
  }, [])

  async function fetchManifests() {
    try {
      const { data, error: fetchError } = await supabase
        .from('manifests')
        .select(`
          id,
          manifest_reference,
          created_at,
          trip_date,
          total_passengers,
          company_id,
          route_id,
          transport_companies (company_name),
          routes (departure_location, destination)
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
    if (!(await confirmToast('Delete this manifest? This will also delete all associated passengers and SMS logs.', { confirmText: 'Delete' }))) {
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

  const normalizedSearch = searchTerm.trim().toLowerCase()

  useEffect(() => {
    let isCancelled = false

    async function searchPassengerManifests() {
      if (!normalizedSearch) {
        setPassengerSearchManifestIds(null)
        setSearchingPassengerNames(false)
        return
      }

      setSearchingPassengerNames(true)
      try {
        const { data, error: searchError } = await supabase
          .from('passengers')
          .select('manifest_id')
          .ilike('full_name', `%${normalizedSearch}%`)
          .not('manifest_id', 'is', null)
          .limit(3000)

        if (searchError) throw searchError

        if (!isCancelled) {
          setPassengerSearchManifestIds(new Set((data || []).map((row) => row.manifest_id)))
        }
      } catch (err) {
        if (!isCancelled) {
          setPassengerSearchManifestIds(new Set())
        }
      } finally {
        if (!isCancelled) {
          setSearchingPassengerNames(false)
        }
      }
    }

    searchPassengerManifests()

    return () => {
      isCancelled = true
    }
  }, [normalizedSearch])

  const filteredManifests = manifests.filter((manifest) => {
    if (!normalizedSearch) return true

    const searchableText = [
      manifest.manifest_reference || '',
      manifest.transport_companies?.company_name || '',
      manifest.routes?.departure_location || '',
      manifest.routes?.destination || ''
    ]
      .join(' ')
      .toLowerCase()

    const matchesManifestFields = searchableText.includes(normalizedSearch)
    const matchesPassengerName = passengerSearchManifestIds ? passengerSearchManifestIds.has(manifest.id) : false

    return matchesManifestFields || matchesPassengerName
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [normalizedSearch])

  const totalPages = Math.max(1, Math.ceil(filteredManifests.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const paginatedManifests = filteredManifests.slice(startIndex, startIndex + pageSize)

  useEffect(() => {
    const manifestIds = paginatedManifests.map((manifest) => manifest.id)
    const idsToFetch = manifestIds.filter((id) => !(id in manifestPassengerNames))

    if (idsToFetch.length === 0) {
      return
    }

    let isCancelled = false

    async function fetchPassengerNamesForPage() {
      try {
        const { data, error: fetchError } = await supabase
          .from('passengers')
          .select('manifest_id, full_name')
          .in('manifest_id', idsToFetch)
          .order('full_name', { ascending: true })

        if (fetchError) throw fetchError

        if (isCancelled) return

        const grouped = idsToFetch.reduce((acc, id) => {
          acc[id] = []
          return acc
        }, {})

        ;(data || []).forEach((row) => {
          if (!grouped[row.manifest_id]) {
            grouped[row.manifest_id] = []
          }
          if (row.full_name) {
            grouped[row.manifest_id].push(row.full_name)
          }
        })

        setManifestPassengerNames((prev) => ({ ...prev, ...grouped }))
      } catch (err) {
        if (!isCancelled) {
          const fallback = idsToFetch.reduce((acc, id) => {
            acc[id] = []
            return acc
          }, {})
          setManifestPassengerNames((prev) => ({ ...prev, ...fallback }))
        }
      }
    }

    fetchPassengerNamesForPage()

    return () => {
      isCancelled = true
    }
  }, [paginatedManifests, manifestPassengerNames])

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 text-white p-7 shadow-xl shadow-emerald-200">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center border border-white/30">
            <FolderClock size={22} />
          </div>
          <div>
            <h2 className="text-3xl font-bold">Manifests History</h2>
            <p className="text-emerald-50 mt-2">Review captured manifests, trip details, and passenger records over time.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div className="flex-1 max-w-2xl">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by passenger name, manifest ref, company or route"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{filteredManifests.length} record{filteredManifests.length === 1 ? '' : 's'} found</p>
          {searchingPassengerNames && (
            <p className="text-xs text-blue-600 mt-1">Searching passenger names...</p>
          )}
          <button
            onClick={() => navigate('/capture-manifest')}
            className="btn-primary px-6 py-3 mt-3"
          >
            + New Manifest
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : filteredManifests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <FileText size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No matching manifests</h3>
          <p className="text-gray-500 mb-6">Try a different name or clear your search.</p>
          <button
            onClick={() => navigate('/capture-manifest')}
            className="btn-primary px-6 py-3"
          >
            Create New Manifest
          </button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 gap-4">
          {paginatedManifests.map((manifest) => (
            <div key={manifest.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center mb-3">
                    <FileText className="text-blue-600 mr-3" size={24} />
                    <div>
                      <h3 className="text-lg font-semibold">{manifest.manifest_reference}</h3>
                      <h3 className="text-lg font-semibold text-slate-800">
                        {(manifestPassengerNames[manifest.id] || []).length > 0
                          ? manifestPassengerNames[manifest.id].join(', ')
                          : 'Passenger name unavailable'}
                      </h3>
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
                    className="btn-icon-danger"
                    title="Delete"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredManifests.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredManifests.length)} of {filteredManifests.length}
          </p>
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
        </>
      )}
    </div>
  )
}