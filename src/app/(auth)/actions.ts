'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authCopy } from '@/lib/copy/auth'

type AuthResult = { error: string } | never

export async function signIn(formData: FormData): Promise<AuthResult> {
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

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  if (!PASSWORD_RE.test(password)) {
    return { error: authCopy.signup.errors.weakPassword }
  }

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

  redirect('/')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
