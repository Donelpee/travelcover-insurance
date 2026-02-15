import { NavLink, Outlet } from 'react-router-dom'
import { Home, Truck, FileText, MessageSquare, Users, Settings, Clock, ShieldCheck, LogOut } from 'lucide-react'
import { usePermissions } from '../contexts/PermissionsContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/capture-manifest', label: 'Capture Manifest', icon: FileText },
  { to: '/manifests', label: 'Manifests History', icon: Users },
  { to: '/message-logs', label: 'Message Logs', icon: MessageSquare },
  { to: '/automation', label: 'Journey Automation', icon: Clock },
  { to: '/companies', label: 'Transport Companies', icon: Truck },
  { to: '/admin-settings', label: 'Admin Settings', icon: Settings }
]

export default function Layout() {
  const { currentUser, signOut } = usePermissions()

  async function handleSignOut() {
    await signOut()
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-72 border-r border-slate-800/60 bg-slate-900 text-slate-100">
          <div className="px-6 py-6 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-sm shadow-blue-500/40">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-white">TravelCover Insurance</h1>
                <p className="text-xs text-slate-400">Operations Console</p>
              </div>
            </div>
          </div>
          <nav className="p-4">
            <ul className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-500/30'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`
                      }
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur px-6 flex items-center justify-between shadow-sm">
            <p className="text-sm font-medium text-slate-700">Welcome back, {currentUser?.full_name || 'Admin'}</p>
            <button
              onClick={handleSignOut}
              className="btn-secondary px-3 py-2 flex items-center gap-2"
            >
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          </header>

          <main className="flex-1 p-6 lg:p-8 overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1440px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}