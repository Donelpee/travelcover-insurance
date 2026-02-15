import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { Calendar, Clock, Filter, Search, ChevronLeft, ChevronRight, Loader2, X as XIcon } from 'lucide-react'
import { success, error, confirm as confirmToast } from '../utils/notifications'
import { processDueNotifications } from '../services/notificationService'
import { getQueueTimingDisplay } from '../utils/queueTiming'

export default function ScheduledMessages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [processingDue, setProcessingDue] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedThread, setSelectedThread] = useState(null)
  const [threadRecipientFilter, setThreadRecipientFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    fetchScheduledMessages()
  }, [])

  async function fetchScheduledMessages(options = {}) {
    const { showRefreshing = false } = options
    if (showRefreshing) {
      setRefreshing(true)
    }

    try {
      const { data: jobs, error: jobsError } = await supabase
        .from('scheduled_jobs')
        .select(`
          *,
          passengers (
            id,
            full_name,
            phone_number,
            next_of_kin_name,
            next_of_kin_phone,
            manifest_id
          )
        `)
        .order('scheduled_time', { ascending: true })

      if (jobsError) throw jobsError

      const manifestIds = [...new Set((jobs || []).map(job => job.manifest_id || job.passengers?.manifest_id).filter(Boolean))]

      let manifestsById = {}
      if (manifestIds.length > 0) {
        const { data: manifests, error: manifestsError } = await supabase
          .from('manifests')
          .select(`
            id,
            manifest_reference,
            trip_date,
            routes (
              departure_location,
              destination
            )
          `)
          .in('id', manifestIds)

        if (!manifestsError && manifests) {
          manifestsById = manifests.reduce((acc, manifest) => {
            acc[manifest.id] = manifest
            return acc
          }, {})
        }
      }

      const enrichedJobs = (jobs || []).map(job => ({
        ...job,
        manifests: manifestsById[job.manifest_id || job.passengers?.manifest_id] || null
      }))

      setMessages(enrichedJobs)
      setLoading(false)
    } catch (err) {
      console.error('Error fetching scheduled messages:', err)
      error('Failed to load scheduled messages', err.message)
      setLoading(false)
    } finally {
      if (showRefreshing) {
        setRefreshing(false)
      }
    }
  }

  function normalizeStatus(status) {
    return (status || '').toString().trim().toLowerCase()
  }

  function toPrincipalRows(inputRows) {
    const grouped = new Map()

    for (const row of inputRows) {
      const key = `${row.manifest_id || row.passengers?.manifest_id || 'manifest'}-${row.passenger_id || row.phone_number}-${row.message_type || 'generic'}`
      const existing = grouped.get(key)

      if (!existing) {
        grouped.set(key, row)
        continue
      }

      const existingTime = new Date(existing.scheduled_time).getTime()
      const currentTime = new Date(row.scheduled_time).getTime()

      if (Number.isFinite(currentTime) && (!Number.isFinite(existingTime) || currentTime > existingTime)) {
        grouped.set(key, row)
        continue
      }

      if (
        Number.isFinite(currentTime) &&
        Number.isFinite(existingTime) &&
        currentTime === existingTime &&
        existing.recipient_type !== 'passenger' &&
        row.recipient_type === 'passenger'
      ) {
        grouped.set(key, row)
      }
    }

    return Array.from(grouped.values()).sort(
      (a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    )
  }

  function getLinkedMessages(principalRow) {
    const principalPassengerId = principalRow.passenger_id || principalRow.passengers?.id || null
    const principalManifestId = principalRow.manifest_id || principalRow.passengers?.manifest_id || null
    const principalPassengerPhone = principalRow.passengers?.phone_number || null
    const principalNokPhone = principalRow.passengers?.next_of_kin_phone || null

    const normalizePhone = (value) => (value || '').replace(/[^0-9+]/g, '')
    const principalPhones = [principalPassengerPhone, principalNokPhone, principalRow.phone_number]
      .map(normalizePhone)
      .filter(Boolean)

    return messages
      .filter((row) => {
        const rowManifestId = row.manifest_id || row.passengers?.manifest_id || null
        const sameManifest = rowManifestId && principalManifestId ? rowManifestId === principalManifestId : false
        if (!sameManifest) return false

        const rowPassengerId = row.passenger_id || row.passengers?.id || null
        if (principalPassengerId && rowPassengerId && principalPassengerId === rowPassengerId) {
          return true
        }

        const rowPhone = normalizePhone(row.phone_number)
        return principalPhones.includes(rowPhone)
      })
      .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime())
  }

  async function cancelMessage(id) {
  if (!(await confirmToast('Cancel this scheduled message?', { confirmText: 'Cancel message' }))) return

  try {
    const { error: updateError } = await supabase
      .from('scheduled_jobs')
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (updateError) throw updateError
    success('Message cancelled!')
    fetchScheduledMessages()
  } catch (err) {
    error('Error cancelling message', err.message)
  }
}

  const principalMessages = toPrincipalRows(messages)

  const filteredMessages = principalMessages.filter(msg => {
    const statusMatch = filter === 'all' ? true : normalizeStatus(msg.status) === filter
    if (!statusMatch) return false

    const q = searchTerm.trim().toLowerCase()
    if (!q) return true

    const text = [
      msg.passengers?.full_name,
      msg.passengers?.next_of_kin_name,
      msg.phone_number,
      msg.manifests?.manifest_reference,
      msg.manifests?.routes?.departure_location,
      msg.manifests?.routes?.destination,
      msg.message_type,
      msg.message_content
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(q)
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [filter, searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const paginatedMessages = filteredMessages.slice(startIndex, startIndex + pageSize)

  const stats = {
    total: principalMessages.length,
    pending: principalMessages.filter(m => normalizeStatus(m.status) === 'pending').length,
    sent: principalMessages.filter(m => normalizeStatus(m.status) === 'sent').length,
    failed: principalMessages.filter(m => normalizeStatus(m.status) === 'failed').length,
    cancelled: principalMessages.filter(m => normalizeStatus(m.status) === 'cancelled').length
  }

    async function handleProcessDueNow() {
      setProcessingDue(true)
      try {
        const results = await processDueNotifications()
        success(
          'Due jobs processed',
          `Mode: ${results.mode || 'unknown'} • SMS Sent: ${results.sent}, SMS Failed: ${results.failed}, Email Sent: ${results.email_sent || 0}, Email Failed: ${results.email_failed || 0}, Total Due: ${results.total}`
        )
        fetchScheduledMessages()
      } catch (err) {
        error('Failed to process due jobs', err.message)
      } finally {
        setProcessingDue(false)
      }
    }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-8">Scheduled Messages</h2>

        <div className="mb-6 flex justify-end gap-3">
          <button
            onClick={() => fetchScheduledMessages({ showRefreshing: true })}
            disabled={refreshing}
            className="btn-secondary px-5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {refreshing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Refreshing...</span>
              </>
            ) : (
              <span>Refresh</span>
            )}
          </button>
          <button
            onClick={handleProcessDueNow}
            disabled={processingDue}
            className="btn-primary px-5"
          >
            {processingDue ? 'Processing Due Jobs...' : 'Process Due Jobs Now'}
          </button>
        </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Sent</p>
          <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-sm text-gray-500">Cancelled</p>
          <p className="text-2xl font-bold text-gray-600">{stats.cancelled}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="mb-3 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by passenger, NOK, manifest or message"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={20} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 mr-4">Filter:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setFilter('sent')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === 'sent' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Sent ({stats.sent})
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              filter === 'failed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Failed ({stats.failed})
          </button>
        </div>
      </div>

      {/* Messages List */}
      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : filteredMessages.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Calendar size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No Scheduled Messages</h3>
          <p className="text-gray-500">Schedule messages from the manifest creation flow</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manifest</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Principal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedMessages.map(msg => {
                const timing = getQueueTimingDisplay(msg.scheduled_time)
                const timingColor =
                  timing.state === 'overdue'
                    ? 'text-red-600'
                    : timing.state === 'due-now'
                    ? 'text-amber-600'
                    : 'text-gray-500'

                return (
                <tr
                  key={msg.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setThreadRecipientFilter('all')
                    setSelectedThread({
                      principal: msg,
                      messages: getLinkedMessages(msg)
                    })
                  }}
                >
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="flex items-center">
                      <Clock size={16} className="mr-2 text-blue-600" />
                      <div>
                        <p>{timing.absolute}</p>
                        <p className={`text-xs ${timingColor}`}>{timing.relative}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <div>
                      <p className="font-medium">{msg.manifests?.manifest_reference || 'N/A'}</p>
                      <p className="text-xs text-gray-400">
                        {(msg.manifests?.routes?.departure_location || 'N/A')} → {(msg.manifests?.routes?.destination || 'N/A')}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">{msg.passengers?.full_name || 'N/A'}</p>
                      <p className="text-xs text-gray-500">{msg.phone_number}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      msg.recipient_type === 'next_of_kin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {msg.recipient_type === 'next_of_kin' ? 'NEXT OF KIN' : 'PASSENGER'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {msg.message_type || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      normalizeStatus(msg.status) === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : normalizeStatus(msg.status) === 'sent'
                        ? 'bg-green-100 text-green-800'
                        : normalizeStatus(msg.status) === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {normalizeStatus(msg.status).toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {normalizeStatus(msg.status) === 'pending' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelMessage(msg.id)
                        }}
                        className="btn-icon-danger"
                        title="Cancel message"
                      >
                        <XIcon size={18} />
                      </button>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {!loading && filteredMessages.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-gray-600">Showing {startIndex + 1}-{Math.min(startIndex + pageSize, filteredMessages.length)} of {filteredMessages.length}</p>
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
      )}

      {selectedThread && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800">Journey Message Thread</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedThread.principal.passengers?.full_name || 'Passenger'} • {selectedThread.principal.manifests?.manifest_reference || 'N/A'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Passenger: {selectedThread.principal.passengers?.phone_number || 'N/A'} • NOK: {selectedThread.principal.passengers?.next_of_kin_phone || 'N/A'}
                </p>
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  {selectedThread.messages.length} queued item{selectedThread.messages.length === 1 ? '' : 's'} linked to this card
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedThread(null)
                  setThreadRecipientFilter('all')
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XIcon size={22} />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-600 font-medium mr-1">Show:</span>
                <button
                  onClick={() => setThreadRecipientFilter('all')}
                  className={`px-2.5 py-1 text-xs rounded-full ${threadRecipientFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  All ({selectedThread.messages.length})
                </button>
                <button
                  onClick={() => setThreadRecipientFilter('passenger')}
                  className={`px-2.5 py-1 text-xs rounded-full ${threadRecipientFilter === 'passenger' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  Passenger ({selectedThread.messages.filter((m) => m.recipient_type === 'passenger').length})
                </button>
                <button
                  onClick={() => setThreadRecipientFilter('next_of_kin')}
                  className={`px-2.5 py-1 text-xs rounded-full ${threadRecipientFilter === 'next_of_kin' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  NOK ({selectedThread.messages.filter((m) => m.recipient_type === 'next_of_kin').length})
                </button>
              </div>

              {selectedThread.messages
                .filter((threadMsg) => threadRecipientFilter === 'all' || threadMsg.recipient_type === threadRecipientFilter)
                .map((threadMsg) => {
                const timing = getQueueTimingDisplay(threadMsg.scheduled_time)
                const timingColor =
                  timing.state === 'overdue'
                    ? 'text-red-600'
                    : timing.state === 'due-now'
                    ? 'text-amber-600'
                    : 'text-gray-600'

                return (
                <div key={threadMsg.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-gray-800">
                      {threadMsg.message_type} • {threadMsg.recipient_type === 'passenger' ? 'Passenger' : 'Next of Kin'}
                    </p>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      normalizeStatus(threadMsg.status) === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : normalizeStatus(threadMsg.status) === 'sent'
                        ? 'bg-green-100 text-green-800'
                        : normalizeStatus(threadMsg.status) === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {normalizeStatus(threadMsg.status).toUpperCase() || 'UNKNOWN'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{timing.absolute}</p>
                  <p className={`text-xs mb-1 ${timingColor}`}>{timing.relative}</p>
                  <p className="text-sm text-gray-600 mb-2">{threadMsg.phone_number}</p>
                  <p className="text-sm text-gray-800 bg-gray-50 rounded p-2">{threadMsg.message_content}</p>
                </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}