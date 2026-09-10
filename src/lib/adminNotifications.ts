import type { createAdminClient } from '@/lib/supabase/admin'

// Resolves every profile with role='admin' to their auth email — there's
// currently no dedicated "admin recipients" table, just the role column.
// Shared by every "notify all admins" flow (package prereserva requests,
// the weekly commission-reminder cron, ...). Never throws: a lookup
// failure here must not break whatever flow is trying to notify admins —
// callers get an empty array and decide what "no admins to notify" means
// for them, same posture as every other email-adjacent lookup in this app.
export async function resolveAdminEmails(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data: adminProfiles, error } = await admin.from('profiles').select('id').eq('role', 'admin')
  if (error) {
    console.error('Failed to look up admin profiles', error)
    return []
  }
  if (!adminProfiles?.length) return []

  const emails = await Promise.all(
    adminProfiles.map(async ({ id }) => {
      const { data } = await admin.auth.admin.getUserById(id)
      return data.user?.email ?? null
    }),
  )

  return emails.filter((email): email is string => !!email)
}
