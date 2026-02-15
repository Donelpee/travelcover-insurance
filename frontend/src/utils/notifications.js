import React from 'react'
import toast from 'react-hot-toast'

// Success notification
export const success = (message, description = '') => {
  toast.success(message, {
    description,
    duration: 3000
  })
}

// Error notification
export const error = (message, description = '') => {
  toast.error(message, {
    description,
    duration: 5000
  })
}

// Warning notification
export const warning = (message, description = '') => {
  toast(message, {
    icon: '⚠️',
    description,
    duration: 4000
  })
}

// Info notification
export const info = (message, description = '') => {
  toast(message, {
    icon: 'ℹ️',
    description,
    duration: 3000
  })
}

// Confirmation toast (returns Promise<boolean>)
export const confirm = (message, options = {}) => {
  const {
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    duration = 8000
  } = options

  return new Promise((resolve) => {
    let settled = false

    const resolveOnce = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const toastId = toast.custom((toastInstance) =>
      React.createElement(
        'div',
        {
          className: 'w-[360px] max-w-full rounded-xl border border-slate-200 bg-white p-4 shadow-lg'
        },
        React.createElement('p', { className: 'text-sm text-slate-700 mb-3' }, message),
        React.createElement(
          'div',
          { className: 'flex justify-end gap-2' },
          React.createElement(
            'button',
            {
              className: 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50',
              onClick: () => {
                toast.dismiss(toastInstance.id)
                resolveOnce(false)
              }
            },
            cancelText
          ),
          React.createElement(
            'button',
            {
              className: 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700',
              onClick: () => {
                toast.dismiss(toastInstance.id)
                resolveOnce(true)
              }
            },
            confirmText
          )
        )
      ),
      { duration }
    )

    setTimeout(() => {
      toast.dismiss(toastId)
      resolveOnce(false)
    }, duration + 200)
  })
}

// Loading toast
export const loading = (message) => {
  return toast.loading(message)
}

// Dismiss toast
export const dismiss = (toastId) => {
  toast.dismiss(toastId)
}

// Promise toast (auto success/error)
export const promise = (promiseFunction, messages) => {
  return toast.promise(promiseFunction, {
    loading: messages.loading || 'Loading...',
    success: messages.success || 'Success!',
    error: messages.error || 'Error occurred'
  })
}