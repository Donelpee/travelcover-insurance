import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { Calendar, Clock, Filter, X as XIcon } from 'lucide-react'
import { success, error } from '../utils/notifications'

export default function ScheduledMessages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchScheduledMessages()
  }, [])

  async function fetchScheduledMessages() {
  try {
    const { data, error: fetchError } = await supabase  // ← Add error destructuring
      .from('scheduled_jobs')
      .select('*')
      .order('scheduled_time', { ascending: true })

    if (fetchError) throw fetchError
    setMessages(data || [])
    setLoading(false)
  } catch (err) {
    console.error('Error fetching scheduled messages:', err)
    setLoading(false)
  }
}

  async function cancelMessage(id) {
  if (!window.confirm('Cancel this scheduled message?')) return

  try {
    const { error: updateError } = await supabase
      .from('scheduled_jobs')  // ← Change from scheduled_sms
      .update({ status: 'cancelled' })
      .eq('id', id)

    if (updateError) throw updateError
    success('Message cancelled!')
    fetchScheduledMessages()
  } catch (err) {
    error('Error cancelling message', err.message)
  }
}

  const filteredMessages = messages.filter(msg => {
    if (filter === 'all') return true
    return msg.status === filter
  })

  const stats = {
    total: messages.length,
    pending: messages.filter(m => m.status === 'pending').length,
    sent: messages.filter(m => m.status === 'sent').length,
    failed: messages.filter(m => m.status === 'failed').length,
    cancelled: messages.filter(m => m.status === 'cancelled').length
  }

  function formatScheduledTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (diff < 0) {
      return `${date.toLocaleString()} (Past due)`
    } else if (hours < 24) {
      return `${date.toLocaleString()} (in ${hours}h ${minutes}m)`
    } else {
      return date.toLocaleString()
    }
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-8">Scheduled Messages</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Sent</p>
          <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Cancelled</p>
          <p className="text-2xl font-bold text-gray-600">{stats.cancelled}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center space-x-2">
          <Filter size={20} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700 mr-4">Filter:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setFilter('sent')}
            className={`px-4 py-2 rounded-lg ${
              filter === 'sent' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Sent ({stats.sent})
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-4 py-2 rounded-lg ${
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
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No Scheduled Messages</h3>
          <p className="text-gray-500">Schedule messages from the manifest creation flow</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manifest</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMessages.map(msg => (
                <tr key={msg.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex items-center">
                      <Clock size={16} className="mr-2 text-blue-600" />
                      {formatScheduledTime(msg.scheduled_time)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div>
                      <p className="font-medium">{msg.passengers?.manifests?.manifest_reference}</p>
                      <p className="text-xs text-gray-400">
                        {msg.passengers?.manifests?.routes?.departure_location} → {msg.passengers?.manifests?.routes?.destination}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div>
                      <p className="font-medium">{msg.passengers?.full_name}</p>
                      <p className="text-xs text-gray-500">{msg.phone_number}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      msg.recipient_type === 'passenger'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {msg.recipient_type === 'passenger' ? 'PASSENGER' : 'NEXT OF KIN'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {msg.sms_schedule_rules?.rule_name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      msg.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : msg.status === 'sent'
                        ? 'bg-green-100 text-green-800'
                        : msg.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {msg.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    {msg.status === 'pending' && (
                      <button
                        onClick={() => cancelMessage(msg.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Cancel message"
                      >
                        <XIcon size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}