import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { Settings, Users, MessageSquare, Save, Plus, Edit, Trash2, X, Send, Shield, CheckCircle, Mail, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { success, error, confirm as confirmToast } from '../utils/notifications'
import EmailTemplates from './EmailTemplates'

export default function AdminSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const availableTabs = ['users', 'templates', 'email-templates', 'sms-settings', 'roles']
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(availableTabs.includes(initialTab) ? initialTab : 'users')
  
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
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState(10)

  // Templates state
  const [templates, setTemplates] = useState([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateForm, setTemplateForm] = useState({
    template_name: '',
    template_type: 'passenger',
    message_content: ''
  })
  const [smsTemplateSearch, setSmsTemplateSearch] = useState('')
  const [smsTemplatePage, setSmsTemplatePage] = useState(1)
  const [smsTemplatePageSize, setSmsTemplatePageSize] = useState(10)

  // SMS Settings state
  const [smsSettings, setSmsSettings] = useState({
    sender_id: '',
    sender_email: '',
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
  const [roleSearch, setRoleSearch] = useState('')
  const [rolePage, setRolePage] = useState(1)
  const [rolePageSize, setRolePageSize] = useState(10)

  useEffect(() => {
    fetchUsers()
    fetchTemplates()
    fetchSMSSettings()
    fetchRoles()
    fetchPermissions()
  }, [])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && availableTabs.includes(tab) && tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [searchParams, activeTab])

  function switchTab(tab) {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

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

    const fullName = userForm.full_name.trim()
    const email = userForm.email.trim().toLowerCase()
    const password = userForm.password

    if (!fullName) {
      error('Validation error', 'Full name is required')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error('Validation error', 'Enter a valid email address')
      return
    }

    if (!editingUser && (!password || password.length < 6)) {
      error('Validation error', 'Password must be at least 6 characters')
      return
    }
    
    try {
      if (editingUser) {
        const updateData = {
          full_name: fullName,
          email,
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
            full_name: fullName,
            email,
            password_hash: password,
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
    if (!(await confirmToast('Delete this user?', { confirmText: 'Delete' }))) return

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

    const templateName = templateForm.template_name.trim()
    const messageContent = templateForm.message_content.trim()

    if (!templateName || !messageContent) {
      error('Validation error', 'Template name and message content are required')
      return
    }

    if (messageContent.length < 10) {
      error('Validation error', 'Template message is too short')
      return
    }

    try {
      const payload = {
        ...templateForm,
        template_name: templateName,
        message_content: messageContent
      }

      if (editingTemplate) {
        const { error: updateError } = await supabase
          .from('sms_templates')
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id)

        if (updateError) throw updateError
        success('Template updated!')
      } else {
        const { error: insertError } = await supabase
          .from('sms_templates')
          .insert([payload])

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
    if (!(await confirmToast('Delete this template?', { confirmText: 'Delete' }))) return

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
    const senderId = (smsSettings.sender_id || '').trim()
    const senderEmail = (smsSettings.sender_email || '').trim().toLowerCase()
    const emergencyContact = (smsSettings.emergency_contact || '').trim()

    if (!senderId) {
      error('Validation error', 'Sender ID is required')
      return
    }

    if (emergencyContact && !/^\+?[0-9\s()-]{8,20}$/.test(emergencyContact)) {
      error('Validation error', 'Emergency contact must be a valid phone number')
      return
    }

    if (senderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
      error('Validation error', 'Sender Email must be a valid email address')
      return
    }

    const normalizedSettings = {
      ...smsSettings,
      sender_id: senderId,
      sender_email: senderEmail,
      emergency_contact: emergencyContact
    }

    setSavingSettings(true)

    try {
      for (const [key, value] of Object.entries(normalizedSettings)) {
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

    const roleName = roleForm.role_name.trim()
    const description = roleForm.description.trim()

    if (!roleName || roleName.length < 3) {
      error('Validation error', 'Role name must be at least 3 characters')
      return
    }

    if (roleForm.permission_ids.length === 0) {
      error('Validation error', 'Select at least one permission')
      return
    }

    try {
      if (editingRole) {
        const { error: roleError } = await supabase
          .from('roles')
          .update({
            role_name: roleName,
            description
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
            role_name: roleName,
            description
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
    if (!(await confirmToast('Delete this role? Users with this role will lose access.', { confirmText: 'Delete' }))) return

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

  const filteredUsers = users.filter((user) => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return true
    return [user.full_name, user.email, user.role, user.is_active ? 'active' : 'inactive']
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize))
  const safeUserPage = Math.min(userPage, userTotalPages)
  const userStartIndex = (safeUserPage - 1) * userPageSize
  const paginatedUsers = filteredUsers.slice(userStartIndex, userStartIndex + userPageSize)

  const filteredSmsTemplates = templates.filter((template) => {
    const q = smsTemplateSearch.trim().toLowerCase()
    if (!q) return true
    return [template.template_name, template.template_type, template.message_content]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
  const smsTemplateTotalPages = Math.max(1, Math.ceil(filteredSmsTemplates.length / smsTemplatePageSize))
  const safeSmsTemplatePage = Math.min(smsTemplatePage, smsTemplateTotalPages)
  const smsTemplateStartIndex = (safeSmsTemplatePage - 1) * smsTemplatePageSize
  const paginatedSmsTemplates = filteredSmsTemplates.slice(smsTemplateStartIndex, smsTemplateStartIndex + smsTemplatePageSize)

  const filteredRoles = roles.filter((role) => {
    const q = roleSearch.trim().toLowerCase()
    if (!q) return true
    const rolePermissions = role.role_permissions?.map((rp) => rp.permissions?.permission_name).filter(Boolean).join(' ') || ''
    return [role.role_name, role.description, rolePermissions]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
  const roleTotalPages = Math.max(1, Math.ceil(filteredRoles.length / rolePageSize))
  const safeRolePage = Math.min(rolePage, roleTotalPages)
  const roleStartIndex = (safeRolePage - 1) * rolePageSize
  const paginatedRoles = filteredRoles.slice(roleStartIndex, roleStartIndex + rolePageSize)

  return (
    <div>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6 shadow-lg shadow-slate-200">
        <h2 className="text-3xl font-bold flex items-center">
          <Settings className="mr-3" size={32} />
          Admin Settings
        </h2>
        <p className="text-slate-200 mt-2">Manage users, templates, notification configuration, and role permissions from one control center.</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex border-b">
          <button
            onClick={() => switchTab('users')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'users'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/70'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="inline mr-2" size={20} />
            User Management
          </button>
          <button
            onClick={() => switchTab('templates')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'templates'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/70'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="inline mr-2" size={20} />
            SMS Templates
          </button>
          <button
            onClick={() => switchTab('email-templates')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'email-templates'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/70'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Mail className="inline mr-2" size={20} />
            Email Templates
          </button>
          <button
            onClick={() => switchTab('sms-settings')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'sms-settings'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/70'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Send className="inline mr-2" size={20} />
            Notification Settings
          </button>
          <button
            onClick={() => switchTab('roles')}
            className={`flex-1 px-6 py-4 font-medium transition-colors ${
              activeTab === 'roles'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/70'
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

          <div className="mb-4 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value)
                setUserPage(1)
              }}
              placeholder="Search users by name, email, role or status"
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
            />
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
              {paginatedUsers.map(user => (
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
                      className="btn-icon-danger"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">Showing {userStartIndex + 1}-{Math.min(userStartIndex + userPageSize, filteredUsers.length)} of {filteredUsers.length}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Rows</span>
                <select
                  value={userPageSize}
                  onChange={(e) => {
                    setUserPageSize(Number(e.target.value))
                    setUserPage(1)
                  }}
                  className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <button
                  onClick={() => setUserPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeUserPage === 1}
                  className="btn-secondary px-3 py-2 disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setUserPage((prev) => Math.min(userTotalPages, prev + 1))}
                  disabled={safeUserPage === userTotalPages}
                  className="btn-secondary px-3 py-2 disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'email-templates' && (
        <div className="bg-white rounded-lg shadow p-6">
          <EmailTemplates embedded />
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
            <div className="mb-2 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={smsTemplateSearch}
                onChange={(e) => {
                  setSmsTemplateSearch(e.target.value)
                  setSmsTemplatePage(1)
                }}
                placeholder="Search SMS templates"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
              />
            </div>
            {paginatedSmsTemplates.map(template => (
              <div key={template.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg">{template.template_name}</h4>
                    <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full mt-2 ${
                      template.template_type === 'passenger' 
                        ? 'bg-blue-100 text-blue-800' 
                        : template.template_type === 'next_of_kin'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-violet-100 text-violet-800'
                    }`}>
                      {template.template_type === 'passenger'
                        ? 'FOR PASSENGER'
                        : template.template_type === 'next_of_kin'
                          ? 'FOR NEXT OF KIN'
                          : 'GENERAL (PASSENGER + NOK)'}
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
                      className="btn-icon-danger"
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

          {filteredSmsTemplates.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">Showing {smsTemplateStartIndex + 1}-{Math.min(smsTemplateStartIndex + smsTemplatePageSize, filteredSmsTemplates.length)} of {filteredSmsTemplates.length}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Rows</span>
                <select
                  value={smsTemplatePageSize}
                  onChange={(e) => {
                    setSmsTemplatePageSize(Number(e.target.value))
                    setSmsTemplatePage(1)
                  }}
                  className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <button
                  onClick={() => setSmsTemplatePage((prev) => Math.max(1, prev - 1))}
                  disabled={safeSmsTemplatePage === 1}
                  className="btn-secondary px-3 py-2 disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setSmsTemplatePage((prev) => Math.min(smsTemplateTotalPages, prev + 1))}
                  disabled={safeSmsTemplatePage === smsTemplateTotalPages}
                  className="btn-secondary px-3 py-2 disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NOTIFICATION SETTINGS TAB */}
      {activeTab === 'sms-settings' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold mb-6">Notification Configuration</h3>

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
                Sender Email ID
              </label>
              <input
                type="email"
                value={smsSettings.sender_email || ''}
                onChange={(e) => setSmsSettings({ ...smsSettings, sender_email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., noreply@travelcover.com.ng"
              />
              <p className="text-xs text-gray-500 mt-1">
                The email address used as the sender identity for outbound emails.
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
            <div className="mb-2 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={roleSearch}
                onChange={(e) => {
                  setRoleSearch(e.target.value)
                  setRolePage(1)
                }}
                placeholder="Search roles and permissions"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg"
              />
            </div>
            {paginatedRoles.map(role => {
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
                        className="btn-icon-danger"
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

          {filteredRoles.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">Showing {roleStartIndex + 1}-{Math.min(roleStartIndex + rolePageSize, filteredRoles.length)} of {filteredRoles.length}</p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Rows</span>
                <select
                  value={rolePageSize}
                  onChange={(e) => {
                    setRolePageSize(Number(e.target.value))
                    setRolePage(1)
                  }}
                  className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <button
                  onClick={() => setRolePage((prev) => Math.max(1, prev - 1))}
                  disabled={safeRolePage === 1}
                  className="btn-secondary px-3 py-2 disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setRolePage((prev) => Math.min(roleTotalPages, prev + 1))}
                  disabled={safeRolePage === roleTotalPages}
                  className="btn-secondary px-3 py-2 disabled:opacity-50"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
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
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
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
                    <option value="general">General (Passenger + Next of Kin)</option>
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
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
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
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary flex-1"
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