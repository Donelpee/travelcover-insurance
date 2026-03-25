import { useState } from 'react'
import { ArrowLeft, Lock, Mail, ShieldCheck } from 'lucide-react'
import { usePermissions } from '../contexts/PermissionsContext'
import { error as showError, success as showSuccess } from '../utils/notifications'

export default function SignInScreen() {
  const {
    signIn,
    requestPasswordReset,
    completePasswordRecovery,
    cancelPasswordRecovery,
    loading,
    authError,
    clearAuthError,
    isPasswordRecovery,
  } = usePermissions()

  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [emailSentTo, setEmailSentTo] = useState('')
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [recoveryForm, setRecoveryForm] = useState({
    new_password: '',
    confirm_password: '',
  })

  async function handleSignInSubmit(event) {
    event.preventDefault()
    clearAuthError()

    try {
      await signIn(form.email.trim().toLowerCase(), form.password)
    } catch (err) {
      showError('Sign-in failed', err.message)
    }
  }

  async function handleForgotPasswordSubmit(event) {
    event.preventDefault()
    clearAuthError()

    const email = form.email.trim().toLowerCase()
    if (!email) {
      showError('Validation error', 'Enter your email address first.')
      return
    }

    try {
      await requestPasswordReset(email)
      setEmailSentTo(email)
      showSuccess('Reset link sent', `Check ${email} for your password reset email.`)
    } catch (err) {
      showError('Could not send reset email', err.message)
    }
  }

  async function handleRecoverySubmit(event) {
    event.preventDefault()
    clearAuthError()

    if (!recoveryForm.new_password || recoveryForm.new_password.length < 8) {
      showError('Validation error', 'New password must be at least 8 characters.')
      return
    }

    if (recoveryForm.new_password !== recoveryForm.confirm_password) {
      showError('Validation error', 'Password confirmation does not match.')
      return
    }

    try {
      await completePasswordRecovery(recoveryForm.new_password)
      setRecoveryForm({ new_password: '', confirm_password: '' })
      showSuccess('Password updated', 'Your password has been reset. You can sign in with the new password now.')
    } catch (err) {
      showError('Password reset failed', err.message)
    }
  }

  const panelTitle = isPasswordRecovery
    ? 'Reset Password'
    : showForgotPassword
      ? 'Forgot Password'
      : 'Sign In'

  const panelDescription = isPasswordRecovery
    ? 'Choose a new password for your account.'
    : showForgotPassword
      ? 'Enter your email address and we will send you a secure password reset link.'
      : 'Use the same email address that is mapped to your admin user record.'

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
          {(showForgotPassword || isPasswordRecovery) && (
            <button
              type="button"
              onClick={() => {
                clearAuthError()
                setEmailSentTo('')
                if (isPasswordRecovery) {
                  cancelPasswordRecovery()
                  setRecoveryForm({ new_password: '', confirm_password: '' })
                } else {
                  setShowForgotPassword(false)
                }
              }}
              className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <ArrowLeft size={16} />
              Back to sign in
            </button>
          )}

          <h2 className="mt-2 text-2xl font-bold">{panelTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {panelDescription}
          </p>

          {!showForgotPassword && !isPasswordRecovery && (
            <form className="mt-8 space-y-5" onSubmit={handleSignInSubmit}>
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

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Signing in...' : 'Sign In Securely'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    clearAuthError()
                    setEmailSentTo('')
                    setShowForgotPassword(true)
                  }}
                  className="w-full rounded-2xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          )}

          {showForgotPassword && !isPasswordRecovery && (
            <form className="mt-8 space-y-5" onSubmit={handleForgotPasswordSubmit}>
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

              {emailSentTo ? (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Reset email sent to {emailSentTo}. Open the link in that email to choose a new password.
                </div>
              ) : null}

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
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          )}

          {isPasswordRecovery && (
            <form className="mt-8 space-y-5" onSubmit={handleRecoverySubmit}>
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Lock size={16} />
                  New Password
                </span>
                <input
                  type="password"
                  value={recoveryForm.new_password}
                  onChange={(event) => setRecoveryForm((current) => ({ ...current, new_password: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                  placeholder="Enter a new password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Lock size={16} />
                  Confirm New Password
                </span>
                <input
                  type="password"
                  value={recoveryForm.confirm_password}
                  onChange={(event) => setRecoveryForm((current) => ({ ...current, confirm_password: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30"
                  placeholder="Confirm your new password"
                  autoComplete="new-password"
                  required
                  minLength={8}
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
                {loading ? 'Updating...' : 'Set New Password'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
