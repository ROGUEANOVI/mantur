'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { profileCopy } from '@/lib/copy/profile'
import { normalizeColombianPhone } from '@/lib/phone'
import { isValidFullName } from '@/lib/name'
import { PASSWORD_RE } from '@/lib/password'
import { changePasswordRateLimit, checkRateLimit } from '@/lib/rate-limit'

type ActionResult = { error: string } | void

const errors = profileCopy.errors
const AVATAR_BUCKET = 'avatars'

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return { supabase, userId: user.id }
}

// Only ever returns a path under the caller's own folder — avatar_url is
// currently always server-generated as `${userId}/...`, but this assertion
// turns that into an enforced invariant instead of an implicit one, so a
// future code path that lets avatar_url be set to an arbitrary value can't
// turn this into a delete-any-object-in-the-bucket primitive.
function extractOwnStoragePath(url: string, bucket: string, userId: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const path = url.slice(idx + marker.length)
  return path.startsWith(`${userId}/`) ? path : null
}

function validateImageFile(file: File | null): string | null {
  if (!file || !file.size) return errors.invalidFile
  const valid = ['image/jpeg', 'image/png', 'image/webp']
  if (!valid.includes(file.type)) return errors.invalidFormat
  if (file.size > 2 * 1024 * 1024) return errors.fileTooLarge
  return null
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedUser()

  const fullName = (formData.get('full_name') as string | null)?.trim() || ''
  const rawPhone = (formData.get('phone') as string | null)?.trim() || ''

  if (!fullName) return { error: errors.nameRequired }
  if (!isValidFullName(fullName)) return { error: errors.invalidName }

  const phone = rawPhone ? normalizeColombianPhone(rawPhone) : null
  if (rawPhone && !phone) return { error: errors.invalidPhone }

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)
  if (error) return { error: errors.generic }

  // phone lives in profile_contact_details (see
  // 20260814000000_move_profiles_phone_to_contact_details) — a table with
  // owner/admin-only RLS, separate from the broadly-readable profiles table.
  // upsert because a user may not have a row here yet (phone is optional and
  // there is no auto-create trigger for this table, unlike profiles).
  const { error: contactError } = await supabase
    .from('profile_contact_details')
    .upsert({ profile_id: userId, phone }, { onConflict: 'profile_id' })

  if (contactError) return { error: errors.generic }

  revalidatePath('/mi-perfil')
}

export async function uploadAvatar(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedUser()

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .single()

  const admin = createAdminClient()
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(AVATAR_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: errors.uploadFailed }

  const { data: { publicUrl } } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId)

  if (updateError) {
    await admin.storage.from(AVATAR_BUCKET).remove([path])
    return { error: errors.saveFailed }
  }

  const previousPath = profile?.avatar_url ? extractOwnStoragePath(profile.avatar_url, AVATAR_BUCKET, userId) : null
  if (previousPath) {
    await admin.storage.from(AVATAR_BUCKET).remove([previousPath])
  }

  revalidatePath('/mi-perfil')
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedUser()

  // Caps current-password guesses independently of Supabase's own IP-based
  // limits — an already-authenticated-but-compromised session (stolen
  // cookie, shared device) could otherwise brute-force the real password
  // via unlimited signInWithPassword attempts below.
  const allowed = await checkRateLimit(changePasswordRateLimit, userId)
  if (!allowed) return { error: errors.rateLimited }

  const currentPassword = formData.get('current_password') as string
  const newPassword = formData.get('new_password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (!PASSWORD_RE.test(newPassword)) return { error: errors.weakPassword }
  if (newPassword !== confirmPassword) return { error: errors.passwordMismatch }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { error: errors.generic }

  // Re-authenticate with the current password before allowing the change —
  // this is what makes this path stronger than the recovery-link flow,
  // which only requires an active session. signInWithPassword against the
  // caller's own email verifies "current password", it does not start a
  // new/different session.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (verifyError) return { error: errors.currentPasswordWrong }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: errors.generic }

  // Revoke every other session for this account — a password change is a
  // credential-compromise recovery action, and leaving other sessions
  // (e.g. one an attacker already holds) alive would defeat that purpose.
  // scope:'others' keeps the caller's own session (just re-authenticated
  // above) alive, so no forced re-login here.
  await supabase.auth.signOut({ scope: 'others' })
}

export async function removeAvatar(): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .single()

  if (!profile?.avatar_url) return

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId)

  if (error) return { error: errors.generic }

  const admin = createAdminClient()
  const storagePath = extractOwnStoragePath(profile.avatar_url, AVATAR_BUCKET, userId)
  if (storagePath) {
    await admin.storage.from(AVATAR_BUCKET).remove([storagePath])
  }

  revalidatePath('/mi-perfil')
}
