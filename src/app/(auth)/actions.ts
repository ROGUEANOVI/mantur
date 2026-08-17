'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authCopy } from '@/lib/copy/auth'
import { authRateLimit, checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isValidFullName } from '@/lib/name'

type AuthResult = { error: string } | never

export async function signIn(formData: FormData): Promise<AuthResult> {
  const allowed = await checkRateLimit(authRateLimit, await getClientIp())
  if (!allowed) return { error: authCopy.login.errors.rateLimited }

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: authCopy.login.errors.invalidCredentials }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role === 'admin') redirect('/admin')
  }

  redirect('/')
}

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/

type SignUpResult = { error: string | null; pendingConfirmation?: boolean }

export async function signUp(formData: FormData): Promise<SignUpResult> {
  const allowed = await checkRateLimit(authRateLimit, await getClientIp())
  if (!allowed) return { error: authCopy.signup.errors.rateLimited }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = (formData.get('full_name') as string | null)?.trim() || ''

  if (!PASSWORD_RE.test(password)) {
    return { error: authCopy.signup.errors.weakPassword }
  }

  if (!fullName) return { error: authCopy.signup.errors.nameRequired }
  if (!isValidFullName(fullName)) return { error: authCopy.signup.errors.invalidName }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    if (error.code === 'user_already_exists') {
      return { error: authCopy.signup.errors.emailInUse }
    }
    if (error.code === 'weak_password') {
      return { error: authCopy.signup.errors.weakPassword }
    }
    return { error: authCopy.signup.errors.generic }
  }

  if (data.user) {
    const admin = createAdminClient()
    // upsert instead of update: handles the edge case where the
    // handle_new_user trigger hasn't committed yet when we reach this line.
    // service_role bypasses RLS; prevent_role_escalation allows NULL auth.uid().
    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: data.user.id,
        full_name: fullName || null,
        role: 'tourist',
      },
      { onConflict: 'id' },
    )
    if (profileError) {
      return { error: authCopy.signup.errors.generic }
    }
  }

  // Email confirmation enabled: Supabase returns the user but no session
  // until they click the link in the confirmation email.
  if (data.user && !data.session) {
    return { error: null, pendingConfirmation: true }
  }

  redirect('/')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
