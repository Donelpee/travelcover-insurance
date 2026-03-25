import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  })
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function sanitizeAppUser(appUser: Record<string, unknown>) {
  return {
    id: appUser.id,
    auth_user_id: appUser.auth_user_id ?? null,
    full_name: appUser.full_name,
    email: appUser.email,
    role: appUser.role,
    is_active: appUser.is_active ?? true,
  }
}

async function findRequesterRow(
  adminClient: ReturnType<typeof createClient>,
  authUser: { id: string; email?: string | null }
) {
  const authUserId = authUser.id
  const authEmail = normalizeEmail(authUser.email ?? '')

  let result = await adminClient
    .from('app_users')
    .select('id, auth_user_id, full_name, email, role, is_active')
    .eq('auth_user_id', authUserId)
    .limit(1)
    .maybeSingle()

  if (result.data) {
    return result
  }

  if (!authEmail) {
    return result
  }

  result = await adminClient
    .from('app_users')
    .select('id, auth_user_id, full_name, email, role, is_active')
    .ilike('email', authEmail)
    .limit(1)
    .maybeSingle()

  if (result.data && !result.data.auth_user_id) {
    await adminClient
      .from('app_users')
      .update({ auth_user_id: authUserId })
      .eq('id', result.data.id)
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase environment variables.' }, 500)
  }

  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header.' }, 401)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)

  const {
    data: { user: authUser },
    error: authError,
  } = await userClient.auth.getUser()

  if (authError || !authUser) {
    return jsonResponse({ error: 'Unauthorized request.' }, 401)
  }

  const requesterResult = await findRequesterRow(adminClient, authUser)

  if (requesterResult.error || !requesterResult.data) {
    return jsonResponse({ error: 'No matching app user was found for this signed-in account.' }, 403)
  }

  const requester = requesterResult.data
  const requesterRole = String(requester.role || '').toLowerCase()
  const isRequesterActive = requester.is_active !== false
  const isAdmin = requesterRole === 'admin' || requesterRole === 'super_admin'

  if (!isRequesterActive || !isAdmin) {
    return jsonResponse({ error: 'You do not have permission to reset passwords.' }, 403)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const userId = String(body.id || '').trim()
    const email = normalizeEmail(String(body.email || ''))
    const newPassword = String(body.new_password || '')

    if ((!userId && !email) || !newPassword) {
      return jsonResponse({ error: 'Provide a target user id or email and a new_password.' }, 400)
    }

    if (newPassword.length < 8) {
      return jsonResponse({ error: 'New password must be at least 8 characters.' }, 400)
    }

    let targetQuery = adminClient
      .from('app_users')
      .select('id, auth_user_id, full_name, email, role, is_active')
      .limit(1)

    targetQuery = userId
      ? targetQuery.eq('id', userId)
      : targetQuery.ilike('email', email)

    const { data: targetUser, error: targetUserError } = await targetQuery.maybeSingle()

    if (targetUserError) {
      return jsonResponse({ error: targetUserError.message }, 400)
    }

    if (!targetUser) {
      return jsonResponse({ error: 'Target app user not found.' }, 404)
    }

    const targetRole = String(targetUser.role || '').toLowerCase()
    if (requesterRole !== 'super_admin' && targetRole === 'super_admin') {
      return jsonResponse({ error: 'Only a super admin can reset another super admin password.' }, 403)
    }

    if (!targetUser.auth_user_id) {
      return jsonResponse({
        error: 'Target app user is not linked to a Supabase Auth account yet.',
        user: sanitizeAppUser(targetUser),
      }, 400)
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      targetUser.auth_user_id,
      { password: newPassword }
    )

    if (updateAuthError) {
      return jsonResponse({ error: updateAuthError.message }, 400)
    }

    return jsonResponse({
      success: true,
      message: 'Password reset successfully.',
      user: sanitizeAppUser(targetUser),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.'
    return jsonResponse({ error: message }, 500)
  }
})
