import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { Truck, Plus, Edit, Trash2, X, MapPin, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { success, error } from '../utils/notifications'

export default function TransportCompanies() {
  const [companies, setCompanies] = useState([])
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [showRouteModal, setShowRouteModal] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [editingRoute, setEditingRoute] = useState(null)
  const [selectedCompanyForRoute, setSelectedCompanyForRoute] = useState(null)
  const [expandedCompany, setExpandedCompany] = useState(null)
  
  const [companyForm, setCompanyForm] = useState({
    company_name: '',
    contact_person: '',
    phone_number: '',
    email: ''
  })

  const [routeForm, setRouteForm] = useState({
    route_name: '',
    departure_location: '',
    destination: '',
    duration_hours: '',
    typical_departure_time: ''
  })

  useEffect(() => {
    fetchCompanies()
    fetchRoutes()
  }, [])

  async function fetchCompanies() {
    try {
      const { data, error: fetchError } = await supabase
        .from('transport_companies')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setCompanies(data || [])
      setLoading(false)
    } catch (err) {
      console.error('Error fetching companies:', err)
      setLoading(false)
    }
  }

  async function fetchRoutes() {
    try {
      const { data, error: fetchError } = await supabase
        .from('routes')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setRoutes(data || [])
    } catch (err) {
      console.error('Error fetching routes:', err)
    }
  }

  function getCompanyRoutes(companyId) {
    return routes.filter(r => r.company_id === companyId)
  }

  async function handleCompanySubmit(e) {
    e.preventDefault()

    try {
      if (editingCompany) {
        const { error: updateError } = await supabase
          .from('transport_companies')
          .update(companyForm)
          .eq('id', editingCompany.id)

        if (updateError) throw updateError
        success('Company updated!')
      } else {
        const { error: insertError } = await supabase
          .from('transport_companies')
          .insert([companyForm])

        if (insertError) throw insertError
        success('Company added!')
      }

      setShowCompanyModal(false)
      setEditingCompany(null)
      setCompanyForm({ company_name: '', contact_person: '', phone_number: '', email: '' })
      fetchCompanies()
    } catch (err) {
      console.error('Error saving company:', err)
      error('Error saving company', err.message)
    }
  }

  async function handleRouteSubmit(e) {
    e.preventDefault()

    const routeName = routeForm.route_name || 
      `${routeForm.departure_location} - ${routeForm.destination}`

    const dataToSave = {
      ...routeForm,
      route_name: routeName,
      company_id: selectedCompanyForRoute,
      duration_hours: routeForm.duration_hours ? parseFloat(routeForm.duration_hours) : null
    }

    try {
      if (editingRoute) {
        const { error: updateError } = await supabase
          .from('routes')
          .update(dataToSave)
          .eq('id', editingRoute.id)

        if (updateError) throw updateError
        success('Route updated!')
      } else {
        const { error: insertError } = await supabase
          .from('routes')
          .insert([dataToSave])

        if (insertError) throw insertError
        success('Route added!')
      }

      setShowRouteModal(false)
      setEditingRoute(null)
      setRouteForm({ route_name: '', departure_location: '', destination: '', duration_hours: '', typical_departure_time: '' })
      fetchRoutes()
    } catch (err) {
      console.error('Error saving route:', err)
      error('Error saving route', err.message)
    }
  }

  async function handleDeleteCompany(id) {
    if (!window.confirm('Delete this company? All routes will also be deleted.')) return

    try {
      const { error: deleteError } = await supabase
        .from('transport_companies')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('Company deleted!')
      fetchCompanies()
      fetchRoutes()
    } catch (err) {
      error('Error deleting company', err.message)
    }
  }

  async function handleDeleteRoute(id) {
    if (!window.confirm('Delete this route?')) return

    try {
      const { error: deleteError } = await supabase
        .from('routes')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      success('Route deleted!')
      fetchRoutes()
    } catch (err) {
      error('Error deleting route', err.message)
    }
  }

  function openAddRouteModal(companyId) {
    setSelectedCompanyForRoute(companyId)
    setEditingRoute(null)
    setRouteForm({ route_name: '', departure_location: '', destination: '', duration_hours: '', typical_departure_time: '' })
    setShowRouteModal(true)
  }

  function openEditRouteModal(route) {
    setSelectedCompanyForRoute(route.company_id)
    setEditingRoute(route)
    setRouteForm({
      route_name: route.route_name,
      departure_location: route.departure_location,
      destination: route.destination,
      duration_hours: route.duration_hours || '',
      typical_departure_time: route.typical_departure_time || ''
    })
    setShowRouteModal(true)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800">Transport Companies & Routes</h2>
        <button
          onClick={() => {
            setEditingCompany(null)
            setCompanyForm({ company_name: '', contact_person: '', phone_number: '', email: '' })
            setShowCompanyModal(true)
          }}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center space-x-2 hover:bg-blue-700"
        >
          <Plus size={20} />
          <span>Add Company</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Truck size={64} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">No Companies Yet</h3>
          <p className="text-gray-500 mb-6">Add your first transport company to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {companies.map((company) => {
            const companyRoutes = getCompanyRoutes(company.id)
            const isExpanded = expandedCompany === company.id

            return (
              <div key={company.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Company Header */}
                <div className="p-6 border-b">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <Truck className="text-blue-600 mr-3" size={24} />
                        <h3 className="text-xl font-semibold">{company.company_name}</h3>
                        <span className={`ml-3 px-2 py-1 text-xs font-semibold rounded-full ${
                          company.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {company.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        {company.contact_person && <p>Contact: {company.contact_person}</p>}
                        {company.phone_number && <p>Phone: {company.phone_number}</p>}
                        {company.email && <p>Email: {company.email}</p>}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openAddRouteModal(company.id)}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-1 text-sm"
                      >
                        <Plus size={16} />
                        <span>Add Route</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingCompany(company)
                          setCompanyForm({
                            company_name: company.company_name,
                            contact_person: company.contact_person || '',
                            phone_number: company.phone_number || '',
                            email: company.email || ''
                          })
                          setShowCompanyModal(true)
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Routes Section (Expandable) */}
                {isExpanded && (
                  <div className="p-6 bg-gray-50">
                    <h4 className="text-lg font-semibold mb-4 flex items-center">
                      <MapPin className="mr-2 text-green-600" size={20} />
                      Routes ({companyRoutes.length})
                    </h4>

                    {companyRoutes.length === 0 ? (
                      <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed">
                        <MapPin size={48} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-500 mb-3">No routes yet for this company</p>
                        <button
                          onClick={() => openAddRouteModal(company.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Add First Route
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {companyRoutes.map((route) => (
                          <div key={route.id} className="bg-white rounded-lg p-4 border">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <div className="flex items-center mb-2">
                                  <MapPin className="text-green-600 mr-2" size={16} />
                                  <h5 className="font-semibold">
                                    {route.departure_location} → {route.destination}
                                  </h5>
                                </div>
                                <p className="text-xs text-gray-500 mb-2">{route.route_name}</p>
                                <div className="flex items-center space-x-4 text-sm text-gray-600">
                                  {route.duration_hours && (
                                    <span className="flex items-center">
                                      <Clock size={14} className="mr-1" />
                                      {route.duration_hours} hrs
                                    </span>
                                  )}
                                  {route.typical_departure_time && (
                                    <span className="flex items-center">
                                      <Clock size={14} className="mr-1" />
                                      Departs: {route.typical_departure_time}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => openEditRouteModal(route)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRoute(route.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Company Modal */}
      {showCompanyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingCompany ? 'Edit Company' : 'Add New Company'}
              </h3>
              <button onClick={() => setShowCompanyModal(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCompanySubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Company Name *</label>
                  <input
                    type="text"
                    required
                    value={companyForm.company_name}
                    onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Contact Person</label>
                  <input
                    type="text"
                    value={companyForm.contact_person}
                    onChange={(e) => setCompanyForm({ ...companyForm, contact_person: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={companyForm.phone_number}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone_number: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCompanyModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingCompany ? 'Update' : 'Add'} Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Route Modal */}
      {showRouteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">
                {editingRoute ? 'Edit Route' : 'Add New Route'}
              </h3>
              <button onClick={() => setShowRouteModal(false)}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleRouteSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Departure Location *</label>
                  <input
                    type="text"
                    required
                    value={routeForm.departure_location}
                    onChange={(e) => setRouteForm({ ...routeForm, departure_location: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Lagos"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Destination *</label>
                  <input
                    type="text"
                    required
                    value={routeForm.destination}
                    onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Abuja"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Duration (hours) *</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={routeForm.duration_hours}
                    onChange={(e) => setRouteForm({ ...routeForm, duration_hours: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., 8.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Typical Departure Time *</label>
                  <input
                    type="time"
                    required
                    value={routeForm.typical_departure_time}
                    onChange={(e) => setRouteForm({ ...routeForm, typical_departure_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Route Name (optional)</label>
                  <input
                    type="text"
                    value={routeForm.route_name}
                    onChange={(e) => setRouteForm({ ...routeForm, route_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Auto-generated if empty"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {editingRoute ? 'Update' : 'Add'} Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}