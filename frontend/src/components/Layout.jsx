import { Link, Outlet } from 'react-router-dom'
import { Home, Truck, FileText, MessageSquare, Users, Settings, Camera, Clock, Calendar, Mail } from 'lucide-react'
export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header className="bg-blue-600 text-white shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">TravelCover Insurance</h1>
            <div className="text-sm">
              <span className="mr-4">Welcome, Admin</span>
              <button className="bg-blue-700 px-4 py-2 rounded hover:bg-blue-800">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-white shadow-md min-h-screen">
          <nav className="p-4">
            <ul className="space-y-2">
              <li>
                <Link
                  to="/"
                  className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                >
                  <Home size={20} />
                  <span>Dashboard</span>
                </Link>
              </li>

              <li>
  <Link
    to="/admin-settings"
    className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
  >
    <Settings size={20} />
    <span>Admin Settings</span>
  </Link>
</li>
              <li>
                <Link
                  to="/capture-manifest"
                  className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                >
                  <FileText size={20} />
                  <span>Capture Manifest</span>
                </Link>
              </li>
              <li>
                <Link
                  to="/companies"
                  className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                >
                  <Truck size={20} />
                  <span>Transport Companies</span>
                </Link>
              </li>
              
              <li>
                <Link
                  to="/manifests"
                  className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
                >
                  <Users size={20} />
                  <span>Manifests History</span>
                </Link>
              <li>
  <Link
    to="/message-logs"
    className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
  >
    <MessageSquare size={20} />
    <span>Message Logs</span>
  </Link>
</li>

  <li>
  <Link
    to="/message-schedule-rules"
    className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
  >
    <Clock size={20} />
    <span>Message Schedule Rules</span>
  </Link>
</li>
</li>

<li>
  <Link
    to="/email-templates"
    className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
  >
    <Mail size={20} />
    <span>Email Templates</span>
  </Link>
</li>

<li>
  <Link
    to="/scheduled-messages"
    className="flex items-center space-x-3 px-4 py-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600"
  >
    <Calendar size={20} />
    <span>Scheduled Messages</span>
  </Link>
</li>
            </ul>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}