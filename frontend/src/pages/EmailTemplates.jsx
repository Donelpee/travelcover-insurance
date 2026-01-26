import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import { Mail, Plus, Edit, Trash2, Eye, Copy, ToggleLeft, ToggleRight } from 'lucide-react'
import { success, error as errorToast, warning, info } from '../utils/notifications'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [currentTemplate, setCurrentTemplate] = useState(null)
  const [formData, setFormData] = useState({
    template_name: '',
    template_type: 'passenger',
    subject: '',
    body_html: ''
  })

  // Rich text editor configuration
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ]
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (err) {
      errorToast('Error loading templates', err.message)
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setCurrentTemplate(null)
    setFormData({
      template_name: '',
      template_type: 'passenger',
      subject: '',
      body_html: ''
    })
    setShowModal(true)
  }

  function openEditModal(template) {
    setCurrentTemplate(template)
    setFormData({
      template_name: template.template_name,
      template_type: template.template_type,
      subject: template.subject,
      body_html: template.body_html
    })
    setShowModal(true)
  }

  function openPreview(template) {
    setCurrentTemplate(template)
    setShowPreview(true)
  }

  async function handleSave() {
    if (!formData.template_name || !formData.subject || !formData.body_html) {
      warning('Please fill all required fields')
      return
    }

    try {
      if (currentTemplate) {
        // Update existing
        const { error } = await supabase
          .from('email_templates')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentTemplate.id)

        if (error) throw error
        success('Template updated successfully')
      } else {
        // Create new
        const { error } = await supabase
          .from('email_templates')
          .insert([formData])

        if (error) throw error
        success('Template created successfully')
      }

      setShowModal(false)
      fetchTemplates()
    } catch (err) {
      errorToast('Error saving template', err.message)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id)

      if (error) throw error
      success('Template deleted successfully')
      fetchTemplates()
    } catch (err) {
      errorToast('Error deleting template', err.message)
    }
  }

  async function handleToggleActive(template) {
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id)

      if (error) throw error
      success(template.is_active ? 'Template deactivated' : 'Template activated')
      fetchTemplates()
    } catch (err) {
      errorToast('Error updating template', err.message)
    }
  }

  async function handleDuplicate(template) {
    try {
      const { error } = await supabase
        .from('email_templates')
        .insert([{
          template_name: `${template.template_name} (Copy)`,
          template_type: template.template_type,
          subject: template.subject,
          body_html: template.body_html,
          is_active: false
        }])

      if (error) throw error
      success('Template duplicated successfully')
      fetchTemplates()
    } catch (err) {
      errorToast('Error duplicating template', err.message)
    }
  }

  // Sample data for preview
  const sampleData = {
    passenger_name: 'John Doe',
    next_of_kin_name: 'Jane Doe',
    company: 'ABC Transport',
    departure: 'Lagos',
    destination: 'Abuja',
    trip_date: new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  function replacePlaceholders(html) {
    let result = html
    Object.keys(sampleData).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g')
      result = result.replace(regex, sampleData[key])
    })
    return result
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading templates...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-800">Email Templates</h2>
          <p className="text-gray-600 mt-1">Create and manage email templates for passenger notifications</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus size={20} />
          <span>New Template</span>
        </button>
      </div>

      {/* Available Variables Info */}
      <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mb-6 rounded">
        <h3 className="font-semibold text-blue-900 mb-2">Available Variables:</h3>
        <p className="text-blue-800 text-sm">
          Use these in your subject and body: <code className="bg-blue-100 px-1 rounded">{'{passenger_name}'}</code>, 
          <code className="bg-blue-100 px-1 rounded mx-1">{'{next_of_kin_name}'}</code>, 
          <code className="bg-blue-100 px-1 rounded">{'{company}'}</code>, 
          <code className="bg-blue-100 px-1 rounded mx-1">{'{departure}'}</code>, 
          <code className="bg-blue-100 px-1 rounded">{'{destination}'}</code>, 
          <code className="bg-blue-100 px-1 rounded mx-1">{'{trip_date}'}</code>
        </p>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(template => (
          <div key={template.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Mail className={template.is_active ? 'text-green-600' : 'text-gray-400'} size={24} />
                  <span className={`text-xs px-2 py-1 rounded ${
                    template.template_type === 'passenger' ? 'bg-blue-100 text-blue-800' :
                    template.template_type === 'next_of_kin' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {template.template_type.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleActive(template)}
                  className="text-gray-400 hover:text-gray-600"
                  title={template.is_active ? 'Deactivate' : 'Activate'}
                >
                  {template.is_active ? <ToggleRight size={24} className="text-green-600" /> : <ToggleLeft size={24} />}
                </button>
              </div>

              <h3 className="text-lg font-semibold text-gray-800 mb-2">{template.template_name}</h3>
              <p className="text-sm text-gray-600 mb-4">
                <strong>Subject:</strong> {template.subject}
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openPreview(template)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                >
                  <Eye size={16} />
                  <span>Preview</span>
                </button>
                <button
                  onClick={() => openEditModal(template)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  <Edit size={16} />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleDuplicate(template)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  <Copy size={16} />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
              </div>

              <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                Created: {new Date(template.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12">
          <Mail className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 mb-4">No email templates yet</p>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Create Your First Template
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <h3 className="text-2xl font-bold text-gray-800">
                {currentTemplate ? 'Edit Template' : 'Create New Template'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={formData.template_name}
                  onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Passenger Welcome Email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Type *
                </label>
                <select
                  value={formData.template_type}
                  onChange={(e) => setFormData({ ...formData, template_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="passenger">Passenger</option>
                  <option value="next_of_kin">Next of Kin</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Subject *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Use variables like {passenger_name}, {company}"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Body (HTML) *
                </label>
                <ReactQuill
                  theme="snow"
                  value={formData.body_html}
                  onChange={(value) => setFormData({ ...formData, body_html: value })}
                  modules={modules}
                  className="bg-white"
                  style={{ height: '300px', marginBottom: '50px' }}
                />
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-3 sticky bottom-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {currentTemplate ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && currentTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white z-10">
              <h3 className="text-2xl font-bold text-gray-800">Email Preview</h3>
              <p className="text-sm text-gray-600 mt-1">
                Preview with sample data
              </p>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <strong>Subject:</strong> {replacePlaceholders(currentTemplate.subject)}
                </p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <iframe
                  srcDoc={replacePlaceholders(currentTemplate.body_html)}
                  className="w-full"
                  style={{ height: '600px' }}
                  title="Email Preview"
                />
              </div>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-end sticky bottom-0">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}