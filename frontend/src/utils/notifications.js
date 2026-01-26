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

// Confirmation dialog
export const confirm = (message, onConfirm, onCancel = () => {}) => {
  // Use browser confirm for now (we can upgrade later)
  if (window.confirm(message)) {
    onConfirm()
  } else {
    onCancel()
  }
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