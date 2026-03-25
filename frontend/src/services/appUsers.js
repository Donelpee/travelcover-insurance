import { supabase } from './supabase'

async function extractFunctionErrorMessage(invocationError) {
  if (invocationError?.context instanceof Response) {
    const payload = await invocationError.context.clone().json().catch(() => null)
    if (payload?.error) {
      return payload.error
    }
  }

  return invocationError?.message || 'Request failed.'
}

async function invokeManageAppUsers(method, body) {
  const { data, error } = await supabase.functions.invoke('manage-app-users', {
    method,
    body,
  })

  if (error) {
    throw new Error(await extractFunctionErrorMessage(error))
  }

  return data
}

export async function getCurrentAppUserProfile() {
  const { data, error } = await supabase.rpc('get_current_app_user_profile')

  if (error) {
    throw error
  }

  return data
}

export async function listAppUsers() {
  const data = await invokeManageAppUsers('GET')
  return data?.users || []
}

export async function createAppUser(payload) {
  const data = await invokeManageAppUsers('POST', payload)
  return data?.user || null
}

export async function updateAppUser(payload) {
  const data = await invokeManageAppUsers('PATCH', payload)
  return data?.user || null
}

export async function deleteAppUser(id) {
  return invokeManageAppUsers('DELETE', { id })
}
