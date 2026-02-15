import { useState } from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Settings2, Clock3, CalendarClock, CheckCircle2 } from 'lucide-react'
import SMSScheduleRules from './SMSScheduleRules'
import ScheduledMessages from './ScheduledMessages'

export default function JourneyAutomation() {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('rules')

  useEffect(() => {
    if (location.pathname === '/scheduled-messages') {
      setActiveTab('queue')
      return
    }
    if (location.pathname === '/message-schedule-rules' || location.pathname === '/automation') {
      setActiveTab('rules')
    }
  }, [location.pathname])

  function handleTabChange(tab) {
    setActiveTab(tab)
    if (tab === 'queue') {
      navigate('/scheduled-messages')
    } else {
      navigate('/automation')
    }
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 text-white p-6 shadow-lg shadow-blue-200">
        <h2 className="text-3xl font-bold">Journey Automation</h2>
        <p className="text-blue-50 mt-2">
          Keep your notification journey simple: set rules once, then monitor and process the queue in real time.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="bg-white/15 backdrop-blur rounded-lg p-3 border border-white/20">
            <p className="text-xs text-white/90 font-semibold uppercase">Step 1</p>
            <p className="text-sm text-white mt-1">Create timing rules for Passenger and Next of Kin.</p>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-lg p-3 border border-white/20">
            <p className="text-xs text-white/90 font-semibold uppercase">Step 2</p>
            <p className="text-sm text-white mt-1">Rules auto-generate scheduled queue messages per manifest.</p>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-lg p-3 border border-white/20">
            <p className="text-xs text-white/90 font-semibold uppercase">Step 3</p>
            <p className="text-sm text-white mt-1">Track statuses and process due items from queue.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => handleTabChange('rules')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'rules'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings2 className="inline mr-2" size={18} />
            Timing Rules Setup
          </button>
          <button
            onClick={() => handleTabChange('queue')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'queue'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarClock className="inline mr-2" size={18} />
            Queue Monitoring
          </button>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg mb-6">
        <p className="text-sm text-slate-700 flex items-center">
          <Clock3 className="mr-2 text-slate-600" size={16} />
          Queue timing uses route-based journey logic and your configured offsets.
        </p>
        <p className="text-sm text-slate-700 flex items-center mt-1">
          <CheckCircle2 className="mr-2 text-emerald-600" size={16} />
          Passenger and Next of Kin notifications stay synchronized across immediate and scheduled flows.
        </p>
      </div>

      {activeTab === 'rules' ? <SMSScheduleRules /> : <ScheduledMessages />}
    </div>
  )
}
