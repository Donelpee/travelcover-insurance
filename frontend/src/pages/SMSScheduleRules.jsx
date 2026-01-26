import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { Clock, Plus, Edit, Trash2, X, Save } from 'lucide-react'
import { success, error } from '../utils/notifications'

export default function SMSScheduleRules() {
  const [rules, setRules] = useState([])
  const [templates, setTemplates] = useState([])
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [ruleForm, setRuleForm] = useState({
    rule_name: '',
    template_id: '',
    recipient_type: 'passenger',
    timing_type: 'after_start',
    minutes_offset: 30,
    apply_to: 'all'
  })

  useEffect(() => {
    fetchRules()
    fetchTemplates()
  }, [])

  async function fetchRules() {
    try {
      const { data, error: fetchError } = await supabase
        .from('sms_schedule_rules')
        .select(`
          *,
          sms_templates (template_name)
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setRules(data || [])
    } catch (err) {
      console.error('Error fetching rules:', err)
    }
  }

  async function fetchTemplates() {
    try {
      const { data, error: fetchError } = await supabase
        .from('sms_templates')
        .select('*')
        .eq('is_active', true)

      if (fetchError) throw fetchError
      setTemplates(data || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    try {
      const dataToSave = {
        ...ruleForm,
        template_id: ruleForm.template_id || null,
        minutes_offset: parseInt(ruleForm.minutes_offset)
      }

      if (editingRule) {
        const { error: updateError } = await supabase
          .from('message_schedule_rules')
          .update(dataToSave)
          .eq('id', editingRule.id)

        if (updateError) throw updateError
        success('Rule updated!')
      } else {
        const { error: insertError } = await supabase
          .from('sms_schedule_rules')
          .insert([dataToSave])

        if (insertError) throw insertError
        success('Rule created!')
      }

      setShowRuleModal(false)
      setRuleForm({
        rule_name: '',
        template_id: '',
        recipient_type: 'passenger',
        timing_type: 'after_start',
        minutes_offset: 30,
        apply_to: 'all'
      })
      setEditingRule(null)
      fetchRules()
    } catch (err) {
      console.error('Error saving rule:', err)
      error('Error saving rule', err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this schedule rule?')) return

    try {
      const { error: deleteError } = await supabase
        .from('sms_schedule_rules')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('Rule deleted!')
      fetchRules()
    } catch (err) {
      error('Error deleting rule', err.message)
    }
  }

  async function toggleActive(id, currentStatus) {
    try {
      const { error: updateError } = await supabase
        .from('sms_schedule_rules')
        .update({ is_active: !currentStatus })
        .eq('id', id)

      if (updateError) throw updateError
      fetchRules()
    } catch (err) {
      error('Error updating rule', err.message)
    }
  }

  function getTimingDescription(rule) {
    const minutes = rule.minutes_offset
    const timing = rule.timing_type === 'after_start' 
      ? `${minutes} minutes after departure`
      : `${minutes} minutes before arrival`
    return timing
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Message Schedule Rules</h2>
          <p className="text-gray-600 mt-1">Configure when automated SMS and Email messages are sent during trips</p>
        </div>
        <button
          onClick={() => {
            setEditingRule(null)
            setRuleForm({
              rule_name: '',
              template_id: '',
              recipient_type: 'passenger',
              timing_type: 'after_start',
              minutes_offset: 30,
              apply_to: 'all'
            })
            setShowRuleModal(true)
          }}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center space-x-2 hover:bg-blue-700"
        >
          <Plus size={20} />
          <span>New Rule</span>
        </button>
      </div>

      {/* Rules List */}
      <div className="grid grid-cols-1 gap-4">
        {rules.map(rule => (
          <div key={rule.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold">{rule.rule_name}</h3>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {rule.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    rule.recipient_type === 'passenger' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {rule.recipient_type === 'passenger' ? 'PASSENGER' : 'NEXT OF KIN'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-500">Timing</p>
                    <p className="text-sm font-medium flex items-center mt-1">
                      <Clock size={16} className="mr-2 text-blue-600" />
                      {getTimingDescription(rule)}
                    </p>
                  </div>
                  {rule.sms_templates && (
                    <div>
                      <p className="text-xs text-gray-500">Template</p>
                      <p className="text-sm font-medium mt-1">{rule.sms_templates.template_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Applies To</p>
                    <p className="text-sm font-medium mt-1 capitalize">{rule.apply_to} trips</p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => toggleActive(rule.id, rule.is_active)}
                  className={`px-3 py-1.5 rounded text-sm ${
                    rule.is_active 
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {rule.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => {
                    setEditingRule(rule)
                    setRuleForm({
                      rule_name: rule.rule_name,
                      template_id: rule.template_id || '',
                      recipient_type: rule.recipient_type,
                      timing_type: rule.timing_type,
                      minutes_offset: rule.minutes_offset,
                      apply_to: rule.apply_to
                    })
                    setShowRuleModal(true)
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Clock size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No Schedule Rules Yet</h3>
            <p className="text-gray-500 mb-6">Create your first rule to automate SMS sending</p>
          </div>
        )}
      </div>

      {/* Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingRule ? 'Edit Schedule Rule' : 'Create New Schedule Rule'}
              </h3>
              <button onClick={() => setShowRuleModal(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Rule Name *</label>
                  <input
                    type="text"
                    required
                    value={ruleForm.rule_name}
                    onChange={(e) => setRuleForm({ ...ruleForm, rule_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Journey Started Notification"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Recipient Type *</label>
                  <select
                    value={ruleForm.recipient_type}
                    onChange={(e) => setRuleForm({ ...ruleForm, recipient_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="passenger">Passenger</option>
                    <option value="next_of_kin">Next of Kin</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Timing Type *</label>
                    <select
                      value={ruleForm.timing_type}
                      onChange={(e) => setRuleForm({ ...ruleForm, timing_type: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="after_start">After Departure</option>
                      <option value="before_end">Before Arrival</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Minutes Offset *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={ruleForm.minutes_offset}
                      onChange={(e) => setRuleForm({ ...ruleForm, minutes_offset: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="e.g., 30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">SMS Template (Optional)</label>
                  <select
                    value={ruleForm.template_id}
                    onChange={(e) => setRuleForm({ ...ruleForm, template_id: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Use default message</option>
                    {templates
                      .filter(t => t.template_type === ruleForm.recipient_type)
                      .map(template => (
                        <option key={template.id} value={template.id}>
                          {template.template_name}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select a template or leave blank to use a default message
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Apply To *</label>
                  <select
                    value={ruleForm.apply_to}
                    onChange={(e) => setRuleForm({ ...ruleForm, apply_to: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="all">All Trips</option>
                    <option value="specific">Specific Trip Only</option>
                  </select>
                </div>

                {/* Preview */}
                <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Preview:</p>
                  <p className="text-sm text-blue-800">
                    Send to <strong>{ruleForm.recipient_type === 'passenger' ? 'Passenger' : 'Next of Kin'}</strong>{' '}
                    <strong>{ruleForm.minutes_offset} minutes</strong>{' '}
                    {ruleForm.timing_type === 'after_start' ? 'after departure' : 'before arrival'}
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Save className="inline mr-2" size={18} />
                  {editingRule ? 'Update' : 'Create'} Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}