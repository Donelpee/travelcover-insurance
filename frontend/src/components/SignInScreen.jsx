import { useState } from 'react'
import { ShieldCheck, Lock, Mail } from 'lucide-react'
import { usePermissions } from '../contexts/PermissionsContext'
import { error as showError } from '../utils/notifications'

export default function SignInScreen() {
  const { signIn, loading, authError, clearAuthError } = usePermissions()
  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  async function handleSubmit(event) {
    event.preventDefault()
    clearAuthError()

    try {
      await signIn(form.email.trim().toLowerCase(), form.password)
    } catch (err) {
      showError('Sign-in failed', err.message)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_40%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_48%,#f8fafc_100%)] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-5xl grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-stretch">
        <section className="rounded-[28px] border border-sky-100 bg-white/85 backdrop-blur p-8 lg:p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="inline-flex items-center gap-3 rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700">
            <ShieldCheck size={16} />
            Secure Admin Access
          </div>

          <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-900">
            TravelCover Operations
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-800">app_users</code> is now protected by Row Level Security. Sign in with a Supabase Auth account that is linked to an active app user profile to continue.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-800">What changed</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The app no longer reads <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-800">app_users</code> directly with the public anon key.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-800">What you need</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                An authenticated admin account whose email matches an active record in <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-800">public.app_users</code>.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] bg-slate-950 text-white p-8 lg:p-10 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <h2 className="text-2xl font-bold">Sign In</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Use the same email address that is mapped to your admin user record.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                <Mail size={16} />
                Email
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                placeholder="admin@travelcover.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                <Lock size={16} />
                Password
              </span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </label>

            {authError ? (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {authError}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Signing in...' : 'Sign In Securely'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
