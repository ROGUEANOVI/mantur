import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { profileCopy } from '@/lib/copy/profile'
import EditProfileForm from '@/components/mi-perfil/EditProfileForm'

export default async function MiPerfilPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // phone lives in profile_contact_details, not profiles — see migration
  // 20260814000000_move_profiles_phone_to_contact_details for why (RLS on
  // profiles is broad/USING(true) for authenticated so joins keep working;
  // the sensitive column was moved out to a table with owner/admin-only RLS).
  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
    supabase.from('profile_contact_details').select('phone').eq('profile_id', user.id).maybeSingle(),
  ])

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-xl font-bold text-foreground">{profileCopy.page.title}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <EditProfileForm
            fullName={profile?.full_name ?? ''}
            phone={contact?.phone ?? ''}
            email={user.email ?? ''}
            avatarUrl={profile?.avatar_url ?? null}
          />
        </div>
      </div>
    </main>
  )
}
