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

  redirect('/')
}

export async function signUp(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string
  const role = formData.get('role') as 'tourist' | 'business_owner' | 'transporter'

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
    await admin
      .from('profiles')
      .update({
        full_name: fullName || null,
        ...(role !== 'tourist' && { role }),
      })
      .eq('id', data.user.id)
  }

  redirect('/')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
