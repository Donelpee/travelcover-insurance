import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { Clock, Plus, Edit, Trash2, ToggleLeft, ToggleRight, Play } from 'lucide-react'
import { success, error as errorToast } from '../utils/notifications'

export default function Automation() {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRules()
  }, [])

  async function fetchRules() {
    const { data, error } = await supabase
      .from('automation_rules')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      errorToast('Error loading rules', error.message)
    } else {
      setRules(data || [])
    }
    setLoading(false)
  }

  async function toggleActive(rule) {
    const { error } = await supabase
      .from('automation_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id)

    if (error) {
      errorToast('Error updating rule', error.message)
    } else {
      success(rule.is_active ? 'Rule deactivated' : 'Rule activated')
      fetchRules()
    }
  }

  const triggerLabels = {
    before_trip: 'Before Trip',
    trip_start: 'Trip Start',
    trip_end: 'Trip End',
    after_trip: 'After Trip'
  }

  if (loading) {
    return <div className="flex justify-center p-12">Loading...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Automated Scheduling</h2>
          <p className="text-gray-600 mt-1">Automatically send notifications based on trip events</p>
        </div>
      </div>

      <div className="grid gap-6">
        {rules.map(rule => (
          <div key={rule.id} className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Clock className={rule.is_active ? 'text-green-600' : 'text-gray-400'} size={32} />
                <div>
                  <h3 className="text-xl font-semibold">{rule.rule_name}</h3>
                  <p className="text-gray-600">
                    {triggerLabels[rule.trigger_type]}
                    {rule.trigger_offset_hours > 0 && ` (${rule.trigger_offset_hours}h ${rule.trigger_type === 'before_trip' ? 'before' : 'after'})`}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-sm">
                  {rule.send_sms && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">SMS</span>}
                  {rule.send_email && <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">Email</span>}
                </div>
                
                <button
                  onClick={() => toggleActive(rule)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {rule.is_active ? 
                    <ToggleRight size={32} className="text-green-600" /> : 
                    <ToggleLeft size={32} />
                  }
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
        <h3 className="font-semibold text-blue-900 mb-2">How It Works:</h3>
        <ul className="text-blue-800 text-sm space-y-1">
          <li>• Rules automatically trigger based on manifest trip times</li>
          <li>• Active rules run when manifests are created</li>
          <li>• Jobs are scheduled in background and execute at the right time</li>
          <li>• Check "Scheduled Messages" page to see pending jobs</li>
        </ul>
      </div>
    </div>
  )
}