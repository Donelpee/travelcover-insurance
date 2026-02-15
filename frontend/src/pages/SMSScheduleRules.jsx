import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { Clock, Plus, Edit, Trash2, X, Save, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { success, error, confirm as confirmToast } from '../utils/notifications'

export default function SMSScheduleRules() {
  const [rules, setRules] = useState([])
  const [templates, setTemplates] = useState([])
  const [companies, setCompanies] = useState([])
  const [routes, setRoutes] = useState([])
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [ruleForm, setRuleForm] = useState({
    rule_name: '',
    template_id: '',
    company_id: '',
    route_id: '',
    recipient_type: 'passenger',
    timing_type: 'after_start',
    minutes_offset: 30
  })

  useEffect(() => {
    fetchRules()
    fetchTemplates()
    fetchCompanies()
    fetchRoutes()
  }, [])

  const filteredRoutes = ruleForm.company_id
    ? routes.filter(route => route.company_id === ruleForm.company_id)
    : routes

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

  async function fetchCompanies() {
    try {
      const { data, error: fetchError } = await supabase
        .from('transport_companies')
        .select('id, company_name')
        .eq('status', 'active')
        .order('company_name', { ascending: true })

      if (fetchError) throw fetchError
      setCompanies(data || [])
    } catch (err) {
      console.error('Error fetching companies:', err)
    }
  }

  async function fetchRoutes() {
    try {
      const { data, error: fetchError } = await supabase
        .from('routes')
        .select('id, company_id, departure_location, destination')
        .eq('status', 'active')
        .order('departure_location', { ascending: true })

      if (fetchError) throw fetchError
      setRoutes(data || [])
    } catch (err) {
      console.error('Error fetching routes:', err)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const ruleName = ruleForm.rule_name.trim()
    const minutesOffset = Number.parseInt(ruleForm.minutes_offset, 10)

    if (!ruleName || ruleName.length < 3) {
      error('Validation error', 'Rule name must be at least 3 characters long')
      return
    }

    if (!Number.isFinite(minutesOffset) || minutesOffset < 0 || minutesOffset > 1440) {
      error('Validation error', 'Minutes offset must be between 0 and 1440')
      return
    }

    try {
      const scopedDataToSave = {
        ...ruleForm,
        rule_name: ruleName,
        template_id: ruleForm.template_id || null,
        company_id: ruleForm.company_id || null,
        route_id: ruleForm.route_id || null,
        minutes_offset: minutesOffset
      }

      const fallbackDataToSave = {
        rule_name: ruleName,
        template_id: ruleForm.template_id || null,
        recipient_type: ruleForm.recipient_type,
        timing_type: ruleForm.timing_type,
        minutes_offset: minutesOffset
      }

      if (editingRule) {
        let { error: updateError } = await supabase
          .from('sms_schedule_rules')
          .update(scopedDataToSave)
          .eq('id', editingRule.id)

        if (updateError && /company_id|route_id/i.test(updateError.message || '')) {
          const fallback = await supabase
            .from('sms_schedule_rules')
            .update(fallbackDataToSave)
            .eq('id', editingRule.id)
          updateError = fallback.error
        }

        if (updateError) throw updateError
        success('Rule updated!')
      } else {
        let { error: insertError } = await supabase
          .from('sms_schedule_rules')
          .insert([{ ...scopedDataToSave, is_active: true }])

        if (insertError && /company_id|route_id/i.test(insertError.message || '')) {
          const fallback = await supabase
            .from('sms_schedule_rules')
            .insert([{ ...fallbackDataToSave, is_active: true }])
          insertError = fallback.error
        }

        if (insertError) throw insertError
        success('Rule created!')
      }

      setShowRuleModal(false)
      setRuleForm({
        rule_name: '',
        template_id: '',
        company_id: '',
        route_id: '',
        recipient_type: 'passenger',
        timing_type: 'after_start',
        minutes_offset: 30
      })
      setEditingRule(null)
      fetchRules()
    } catch (err) {
      console.error('Error saving rule:', err)
      error('Error saving rule', err.message)
    }
  }

  async function handleDelete(id) {
    if (!(await confirmToast('Delete this schedule rule?', { confirmText: 'Delete' }))) return

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

  function getScopeDescription(rule) {
    const companyName = companies.find(c => c.id === rule.company_id)?.company_name || 'All companies'
    const route = routes.find(r => r.id === rule.route_id)
    const routeName = route ? `${route.departure_location} → ${route.destination}` : 'All routes'
    return `${companyName} • ${routeName}`
  }

  const filteredRules = rules.filter((rule) => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return true

    const text = [
      rule.rule_name,
      rule.recipient_type,
      rule.timing_type,
      getScopeDescription(rule),
      rule.sms_templates?.template_name
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(q)
  })

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const totalPages = Math.max(1, Math.ceil(filteredRules.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const paginatedRules = filteredRules.slice(startIndex, startIndex + pageSize)

  return (
    <div>
      <div className="flex justify-between items-center mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Notification Timing Rules</h2>
          <p className="text-gray-600 mt-1">Define who gets notified and when, based on departure and arrival milestones.</p>
        </div>
        <button
          onClick={() => {
            setEditingRule(null)
            setRuleForm({
              rule_name: '',
              template_id: '',
              company_id: '',
              route_id: '',
              recipient_type: 'passenger',
              timing_type: 'after_start',
              minutes_offset: 30
            })
            setShowRuleModal(true)
          }}
          className="btn-primary px-5 py-2.5 flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>Add Rule</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search rules by name, recipient, timing, scope or template"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {/* Rules List */}
      <div className="grid grid-cols-1 gap-4">
        {paginatedRules.map(rule => (
          <div key={rule.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
                    <p className="text-sm font-medium mt-1">{getScopeDescription(rule)}</p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => toggleActive(rule.id, rule.is_active)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
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
                      company_id: rule.company_id || '',
                      route_id: rule.route_id || '',
                      recipient_type: rule.recipient_type,
                      timing_type: rule.timing_type,
                      minutes_offset: rule.minutes_offset
                    })
                    setShowRuleModal(true)
                  }}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-100"
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="btn-icon-danger border border-transparent hover:border-red-100"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredRules.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Clock size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">No matching schedule rules</h3>
            <p className="text-gray-500 mb-6">Try a different search keyword.</p>
          </div>
        )}
        {filteredRules.length > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-gray-600">Showing {startIndex + 1}-{Math.min(startIndex + pageSize, filteredRules.length)} of {filteredRules.length}</p>
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
                    <label className="block text-sm font-medium mb-2">Company Scope</label>
                    <select
                      value={ruleForm.company_id}
                      onChange={(e) => setRuleForm({ ...ruleForm, company_id: e.target.value, route_id: '' })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">All Companies</option>
                      {companies.map(company => (
                        <option key={company.id} value={company.id}>{company.company_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Route Scope</label>
                    <select
                      value={ruleForm.route_id}
                      onChange={(e) => setRuleForm({ ...ruleForm, route_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">All Routes</option>
                      {filteredRoutes.map(route => (
                        <option key={route.id} value={route.id}>
                          {route.departure_location} → {route.destination}
                        </option>
                      ))}
                    </select>
                  </div>
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

                {/* Preview */}
                <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Preview:</p>
                  <p className="text-sm text-blue-800">
                    Send to <strong>{ruleForm.recipient_type === 'passenger' ? 'Passenger' : 'Next of Kin'}</strong>{' '}
                    <strong>{ruleForm.minutes_offset} minutes</strong>{' '}
                    {ruleForm.timing_type === 'after_start' ? 'after departure' : 'before arrival'} for{' '}
                    <strong>
                      {companies.find(c => c.id === ruleForm.company_id)?.company_name || 'all companies'}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
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