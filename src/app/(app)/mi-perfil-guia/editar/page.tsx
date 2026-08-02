import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { guidesCopy } from '@/lib/copy/guides'
import EditGuideProfileForm from '@/components/mi-perfil-guia/EditGuideProfileForm'

export default async function EditGuideProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: guide } = await supabase
    .from('tourist_guides')
    .select('phone, bio, specialties, languages')
    .eq('profile_id', user.id)
    .single()

  if (!guide) redirect('/mi-perfil-guia')

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-xl font-bold text-foreground">{guidesCopy.editProfile.pageTitle}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <EditGuideProfileForm
            phone={guide.phone ?? ''}
            bio={guide.bio ?? null}
            specialties={(guide.specialties as string[]) ?? []}
            languages={(guide.languages as string[]) ?? []}
          />
        </div>
      </div>
    </main>
  )
}
