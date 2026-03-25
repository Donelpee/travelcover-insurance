import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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
    created_at: appUser.created_at ?? null,
    updated_at: appUser.updated_at ?? null,
  }
}

async function findRequesterRow(adminClient: ReturnType<typeof createClient>, authUser: { id: string; email?: string | null }) {
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

async function insertAppUserMetadata(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  let insertResult = await adminClient
    .from('app_users')
    .insert([payload])
    .select('id, auth_user_id, full_name, email, role, is_active, created_at, updated_at')
    .single()

  if (!insertResult.error) {
    return insertResult
  }

  const needsPasswordPlaceholder =
    /password_hash/i.test(insertResult.error.message || '') ||
    /null value/i.test(insertResult.error.message || '')

  if (!needsPasswordPlaceholder) {
    return insertResult
  }

  insertResult = await adminClient
    .from('app_users')
    .insert([
      {
        ...payload,
        password_hash: 'managed-by-supabase-auth',
      },
    ])
    .select('id, auth_user_id, full_name, email, role, is_active, created_at, updated_at')
    .single()

  return insertResult
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
  const isActive = requester.is_active !== false
  const isAdmin = requesterRole === 'admin' || requesterRole === 'super_admin'

  if (!isActive || !isAdmin) {
    return jsonResponse({ error: 'You do not have permission to manage app users.' }, 403)
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await adminClient
        .from('app_users')
        .select('id, auth_user_id, full_name, email, role, is_active, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (error) {
        return jsonResponse({ error: error.message }, 400)
      }

      return jsonResponse({
        users: (data || []).map(sanitizeAppUser),
      })
    }

    const body = await req.json().catch(() => ({}))

    if (req.method === 'POST') {
      const fullName = String(body.full_name || '').trim()
      const email = normalizeEmail(String(body.email || ''))
      const password = String(body.password || '')
      const role = String(body.role || '').trim()

      if (!fullName || !email || !password || !role) {
        return jsonResponse({ error: 'Full name, email, password, and role are required.' }, 400)
      }

      if (password.length < 6) {
        return jsonResponse({ error: 'Password must be at least 6 characters.' }, 400)
      }

      const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      })

      if (createAuthError || !createdAuthUser.user) {
        return jsonResponse({ error: createAuthError?.message || 'Failed to create auth user.' }, 400)
      }

      const insertPayload = {
        auth_user_id: createdAuthUser.user.id,
        full_name: fullName,
        email,
        role,
        is_active: true,
      }

      const insertResult = await insertAppUserMetadata(adminClient, insertPayload)

      if (insertResult.error || !insertResult.data) {
        await adminClient.auth.admin.deleteUser(createdAuthUser.user.id)
        return jsonResponse({ error: insertResult.error?.message || 'Failed to create app user profile.' }, 400)
      }

      return jsonResponse({
        user: sanitizeAppUser(insertResult.data),
      }, 201)
    }

    if (req.method === 'PATCH') {
      const userId = String(body.id || '').trim()
      const fullName = String(body.full_name || '').trim()
      const email = normalizeEmail(String(body.email || ''))
      const role = String(body.role || '').trim()
      const password = String(body.password || '')
      const isUserActive = body.is_active

      if (!userId || !fullName || !email || !role) {
        return jsonResponse({ error: 'User id, full name, email, and role are required.' }, 400)
      }

      const { data: existingUser, error: existingUserError } = await adminClient
        .from('app_users')
        .select('id, auth_user_id, email')
        .eq('id', userId)
        .single()

      if (existingUserError || !existingUser) {
        return jsonResponse({ error: existingUserError?.message || 'App user not found.' }, 404)
      }

      if (existingUser.auth_user_id) {
        const authUpdatePayload: Record<string, unknown> = {
          email,
          user_metadata: {
            full_name: fullName,
          },
        }

        if (password) {
          if (password.length < 6) {
            return jsonResponse({ error: 'Password must be at least 6 characters.' }, 400)
          }

          authUpdatePayload.password = password
        }

        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
          existingUser.auth_user_id,
          authUpdatePayload
        )

        if (authUpdateError) {
          return jsonResponse({ error: authUpdateError.message }, 400)
        }
      }

      const updatePayload: Record<string, unknown> = {
        full_name: fullName,
        email,
        role,
      }

      if (typeof isUserActive === 'boolean') {
        updatePayload.is_active = isUserActive
      }

      const { data: updatedUser, error: updateError } = await adminClient
        .from('app_users')
        .update(updatePayload)
        .eq('id', userId)
        .select('id, auth_user_id, full_name, email, role, is_active, created_at, updated_at')
        .single()

      if (updateError || !updatedUser) {
        return jsonResponse({ error: updateError?.message || 'Failed to update app user.' }, 400)
      }

      return jsonResponse({
        user: sanitizeAppUser(updatedUser),
      })
    }

    if (req.method === 'DELETE') {
      const userId = String(body.id || '').trim()

      if (!userId) {
        return jsonResponse({ error: 'User id is required.' }, 400)
      }

      const { data: existingUser, error: existingUserError } = await adminClient
        .from('app_users')
        .select('id, auth_user_id')
        .eq('id', userId)
        .single()

      if (existingUserError || !existingUser) {
        return jsonResponse({ error: existingUserError?.message || 'App user not found.' }, 404)
      }

      if (existingUser.auth_user_id) {
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(existingUser.auth_user_id)
        if (deleteAuthError) {
          return jsonResponse({ error: deleteAuthError.message }, 400)
        }
      }

      const { error: deleteProfileError } = await adminClient
        .from('app_users')
        .delete()
        .eq('id', userId)

      if (deleteProfileError) {
        return jsonResponse({ error: deleteProfileError.message }, 400)
      }

      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.'
    return jsonResponse({ error: message }, 500)
  }
})
