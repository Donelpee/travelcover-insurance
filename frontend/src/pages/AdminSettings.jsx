import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { Settings, Users, MessageSquare, Save, Plus, Edit, Trash2, X, Send, Shield, CheckCircle } from 'lucide-react'
import { success, error } from '../utils/notifications'

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState('users')
  
  // Users state
  const [users, setUsers] = useState([])
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userForm, setUserForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'operator'
  })

  // Templates state
  const [templates, setTemplates] = useState([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateForm, setTemplateForm] = useState({
    template_name: '',
    template_type: 'passenger',
    message_content: ''
  })

  // SMS Settings state
  const [smsSettings, setSmsSettings] = useState({
    sender_id: '',
    sms_frequency: 'immediate',
    emergency_contact: ''
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // Roles state
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [showRoleModal, setShowRoleModal] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [roleForm, setRoleForm] = useState({
    role_name: '',
    description: '',
    permission_ids: []
  })

  useEffect(() => {
    fetchUsers()
    fetchTemplates()
    fetchSMSSettings()
    fetchRoles()
    fetchPermissions()
  }, [])

  // ====== USER MANAGEMENT ======
  async function fetchUsers() {
    try {
      const { data, error: fetchError } = await supabase
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setUsers(data || [])
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  async function handleUserSubmit(e) {
    e.preventDefault()
    
    try {
      if (editingUser) {
        const updateData = {
          full_name: userForm.full_name,
          email: userForm.email,
          role: userForm.role
        }
        
        if (userForm.password) {
          updateData.password_hash = userForm.password
        }

        const { error: updateError } = await supabase
          .from('app_users')
          .update(updateData)
          .eq('id', editingUser.id)

        if (updateError) throw updateError
        success('User updated!')
      } else {
        const { error: insertError } = await supabase
          .from('app_users')
          .insert([{
            full_name: userForm.full_name,
            email: userForm.email,
            password_hash: userForm.password,
            role: userForm.role
          }])

        if (insertError) throw insertError
        success('User created!')
      }

      setShowUserModal(false)
      setUserForm({ full_name: '', email: '', password: '', role: 'operator' })
      setEditingUser(null)
      fetchUsers()
    } catch (err) {
      console.error('Error saving user:', err)
      error('Error saving user', err.message)
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('Delete this user?')) return

    try {
      const { error: deleteError } = await supabase
        .from('app_users')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('User deleted!')
      fetchUsers()
    } catch (err) {
      error('Error deleting user', err.message)
    }
  }

  // ====== TEMPLATE MANAGEMENT ======
  async function fetchTemplates() {
    try {
      const { data, error: fetchError } = await supabase
        .from('sms_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setTemplates(data || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
    }
  }

  async function handleTemplateSubmit(e) {
    e.preventDefault()

    try {
      if (editingTemplate) {
        const { error: updateError } = await supabase
          .from('sms_templates')
          .update({
            ...templateForm,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id)

        if (updateError) throw updateError
        success('Template updated!')
      } else {
        const { error: insertError } = await supabase
          .from('sms_templates')
          .insert([templateForm])

        if (insertError) throw insertError
        success('Template created!')
      }

      setShowTemplateModal(false)
      setTemplateForm({ template_name: '', template_type: 'passenger', message_content: '' })
      setEditingTemplate(null)
      fetchTemplates()
    } catch (err) {
      error('Error saving template', err.message)
    }
  }

  async function handleDeleteTemplate(id) {
    if (!window.confirm('Delete this template?')) return

    try {
      const { error: deleteError } = await supabase
        .from('sms_templates')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('Template deleted!')
      fetchTemplates()
    } catch (err) {
      error('Error deleting template', err.message)
    }
  }

  // ====== SMS SETTINGS ======
  async function fetchSMSSettings() {
    try {
      const { data, error: fetchError } = await supabase
        .from('sms_settings')
        .select('*')

      if (fetchError) throw fetchError
      
      const settings = {}
      data.forEach(setting => {
        settings[setting.setting_key] = setting.setting_value
      })
      
      setSmsSettings(settings)
    } catch (err) {
      console.error('Error fetching SMS settings:', err)
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true)

    try {
      for (const [key, value] of Object.entries(smsSettings)) {
        await supabase
          .from('sms_settings')
          .upsert({
            setting_key: key,
            setting_value: value,
            updated_at: new Date().toISOString()
          }, { onConflict: 'setting_key' })
      }

      success('Settings saved!')
    } catch (err) {
      error('Error saving settings', err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  // ====== ROLES & PERMISSIONS ======
  async function fetchRoles() {
    try {
      const { data, error: fetchError } = await supabase
        .from('roles')
        .select(`
          *,
          role_permissions (
            permissions (*)
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setRoles(data || [])
    } catch (err) {
      console.error('Error fetching roles:', err)
    }
  }

  async function fetchPermissions() {
    try {
      const { data, error: fetchError } = await supabase
        .from('permissions')
        .select('*')
        .order('category', { ascending: true })

      if (fetchError) throw fetchError
      setPermissions(data || [])
    } catch (err) {
      console.error('Error fetching permissions:', err)
    }
  }

  async function handleRoleSubmit(e) {
    e.preventDefault()

    try {
      if (editingRole) {
        const { error: roleError } = await supabase
          .from('roles')
          .update({
            role_name: roleForm.role_name,
            description: roleForm.description
          })
          .eq('id', editingRole.id)

        if (roleError) throw roleError

        await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', editingRole.id)

        const permissionsToInsert = roleForm.permission_ids.map(permId => ({
          role_id: editingRole.id,
          permission_id: permId
        }))

        const { error: permError } = await supabase
          .from('role_permissions')
          .insert(permissionsToInsert)

        if (permError) throw permError

        success('Role updated!')
      } else {
        const { data: newRole, error: roleError } = await supabase
          .from('roles')
          .insert([{
            role_name: roleForm.role_name,
            description: roleForm.description
          }])
          .select()
          .single()

        if (roleError) throw roleError

        const permissionsToInsert = roleForm.permission_ids.map(permId => ({
          role_id: newRole.id,
          permission_id: permId
        }))

        const { error: permError } = await supabase
          .from('role_permissions')
          .insert(permissionsToInsert)

        if (permError) throw permError

        success('Role created!')
      }

      setShowRoleModal(false)
      setRoleForm({ role_name: '', description: '', permission_ids: [] })
      setEditingRole(null)
      fetchRoles()
    } catch (err) {
      console.error('Error saving role:', err)
      error('Error saving role', err.message)
    }
  }

  async function handleDeleteRole(id) {
    if (!window.confirm('Delete this role? Users with this role will lose access.')) return

    try {
      const { error: deleteError } = await supabase
        .from('roles')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('Role deleted!')
      fetchRoles()
    } catch (err) {
      error('Error deleting role', err.message)
    }
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-800 mb-8 flex items-center">
        <Settings className="mr-3" size={32} />
        Admin Settings
      </h2>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'users'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="inline mr-2" size={20} />
            User Management
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'templates'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="inline mr-2" size={20} />
            SMS Templates
          </button>
          <button
            onClick={() => setActiveTab('sms-settings')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'sms-settings'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Send className="inline mr-2" size={20} />
            SMS Settings
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'roles'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Shield className="inline mr-2" size={20} />
            Roles & Permissions
          </button>
        </div>
      </div>

      {/* USER MANAGEMENT TAB */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold">System Users</h3>
            <button
              onClick={() => {
                setEditingUser(null)
                setUserForm({ full_name: '', email: '', password: '', role: 'operator' })
                setShowUserModal(true)
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700"
            >
              <Plus size={18} />
              <span>Add User</span>
            </button>
          </div>

          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.full_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {user.role?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {user.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <button
                      onClick={() => {
                        setEditingUser(user)
                        setUserForm({
                          full_name: user.full_name,
                          email: user.email,
                          password: '',
                          role: user.role
                        })
                        setShowUserModal(true)
                      }}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SMS TEMPLATES TAB */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-xl font-semibold">SMS Message Templates</h3>
              <p className="text-sm text-gray-500 mt-1">
                Use variables: {'{passenger_name}'}, {'{departure}'}, {'{destination}'}, {'{company}'}, {'{trip_date}'}, {'{next_of_kin_name}'}
              </p>
            </div>
            <button
              onClick={() => {
                setEditingTemplate(null)
                setTemplateForm({ template_name: '', template_type: 'passenger', message_content: '' })
                setShowTemplateModal(true)
              }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-green-700"
            >
              <Plus size={18} />
              <span>New Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {templates.map(template => (
              <div key={template.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg">{template.template_name}</h4>
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-2 ${
                      template.template_type === 'passenger' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {template.template_type === 'passenger' ? 'FOR PASSENGER' : 'FOR NEXT OF KIN'}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setEditingTemplate(template)
                        setTemplateForm({
                          template_name: template.template_name,
                          template_type: template.template_type,
                          message_content: template.message_content
                        })
                        setShowTemplateModal(true)
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="bg-gray-50 rounded p-3 mt-3">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{template.message_content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SMS SETTINGS TAB */}
      {activeTab === 'sms-settings' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-6">SMS Configuration</h3>

          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sender ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={smsSettings.sender_id || ''}
                onChange={(e) => setSmsSettings({ ...smsSettings, sender_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., TravelGuard"
              />
              <p className="text-xs text-gray-500 mt-1">
                The name that appears as sender. Must be approved by your SMS provider.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SMS Frequency
              </label>
              <select
                value={smsSettings.sms_frequency || 'immediate'}
                onChange={(e) => setSmsSettings({ ...smsSettings, sms_frequency: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="immediate">Send Immediately</option>
                <option value="scheduled">Scheduled (Set time)</option>
                <option value="batch">Batch (Queue for bulk send)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Emergency Contact Number
              </label>
              <input
                type="tel"
                value={smsSettings.emergency_contact || ''}
                onChange={(e) => setSmsSettings({ ...smsSettings, emergency_contact: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+234 800 000 0000"
              />
              <p className="text-xs text-gray-500 mt-1">
                This number appears in SMS messages for emergency support.
              </p>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="w-full bg-blue-600 text-white py-3 rounded-lg flex items-center justify-center space-x-2 hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={20} />
              <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ROLES & PERMISSIONS TAB */}
      {activeTab === 'roles' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold">Roles & Permissions</h3>
            <button
              onClick={() => {
                setEditingRole(null)
                setRoleForm({ role_name: '', description: '', permission_ids: [] })
                setShowRoleModal(true)
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700"
            >
              <Plus size={18} />
              <span>Create Role</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {roles.map(role => {
              const rolePermissions = role.role_permissions?.map(rp => rp.permissions) || []
              const permissionsByCategory = rolePermissions.reduce((acc, perm) => {
                if (!acc[perm.category]) acc[perm.category] = []
                acc[perm.category].push(perm)
                return acc
              }, {})

              return (
                <div key={role.id} className="border rounded-lg p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-lg font-semibold">{role.role_name}</h4>
                      <p className="text-sm text-gray-600 mt-1">{role.description}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {rolePermissions.length} permissions assigned
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setEditingRole(role)
                          setRoleForm({
                            role_name: role.role_name,
                            description: role.description || '',
                            permission_ids: rolePermissions.map(p => p.id)
                          })
                          setShowRoleModal(true)
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Permissions by Category */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(permissionsByCategory).map(([category, perms]) => (
                      <div key={category} className="bg-gray-50 rounded p-3">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">{category}</h5>
                        <div className="space-y-1">
                          {perms.map(perm => (
                            <div key={perm.id} className="flex items-center text-xs text-gray-600">
                              <CheckCircle size={12} className="text-green-600 mr-1" />
                              {perm.permission_name}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* USER MODAL */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h3>
              <button onClick={() => setShowUserModal(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUserSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={userForm.full_name}
                    onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    required
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Role *</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="operator">Operator</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingUser ? 'Update' : 'Create'} User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </h3>
              <button onClick={() => setShowTemplateModal(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleTemplateSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Template Name *</label>
                  <input
                    type="text"
                    required
                    value={templateForm.template_name}
                    onChange={(e) => setTemplateForm({ ...templateForm, template_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Welcome Message"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Template Type *</label>
                  <select
                    value={templateForm.template_type}
                    onChange={(e) => setTemplateForm({ ...templateForm, template_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="passenger">For Passenger</option>
                    <option value="next_of_kin">For Next of Kin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Message Content *</label>
                  <textarea
                    required
                    value={templateForm.message_content}
                    onChange={(e) => setTemplateForm({ ...templateForm, message_content: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows="8"
                    placeholder="Dear {passenger_name},&#10;&#10;Safe journey from {departure} to {destination}..."
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Available variables: {'{passenger_name}'}, {'{next_of_kin_name}'}, {'{departure}'}, {'{destination}'}, {'{company}'}, {'{trip_date}'}
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {editingTemplate ? 'Update' : 'Create'} Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROLE MODAL */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-8 max-w-4xl w-full mx-4 my-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingRole ? 'Edit Role' : 'Create New Role'}
              </h3>
              <button onClick={() => setShowRoleModal(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleRoleSubmit}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Role Name *</label>
                  <input
                    type="text"
                    required
                    value={roleForm.role_name}
                    onChange={(e) => setRoleForm({ ...roleForm, role_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Content Manager"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows="2"
                    placeholder="Describe what this role can do"
                  />
                </div>
              </div>

              {/* Permissions Selection */}
              <div className="mb-6">
                <h4 className="font-semibold mb-4">Assign Permissions</h4>
                <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                  {Object.entries(
                    permissions.reduce((acc, perm) => {
                      if (!acc[perm.category]) acc[perm.category] = []
                      acc[perm.category].push(perm)
                      return acc
                    }, {})
                  ).map(([category, perms]) => (
                    <div key={category} className="mb-4">
                      <h5 className="font-semibold text-gray-700 mb-2 bg-gray-50 px-3 py-2 rounded">
                        {category}
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-3">
                        {perms.map(perm => (
                          <label key={perm.id} className="flex items-start space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={roleForm.permission_ids.includes(perm.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setRoleForm({
                                    ...roleForm,
                                    permission_ids: [...roleForm.permission_ids, perm.id]
                                  })
                                } else {
                                  setRoleForm({
                                    ...roleForm,
                                    permission_ids: roleForm.permission_ids.filter(id => id !== perm.id)
                                  })
                                }
                              }}
                              className="mt-1"
                            />
                            <div>
                              <p className="text-sm font-medium">{perm.permission_name}</p>
                              <p className="text-xs text-gray-500">{perm.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingRole ? 'Update' : 'Create'} Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}