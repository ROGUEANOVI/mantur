import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { guidesCopy } from '@/lib/copy/guides'
import AvailabilityCalendar from '@/components/shared/AvailabilityCalendar'
import { setGuideAvailability } from '../actions'

export default async function GuideAvailabilityPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'tourist_guide') redirect('/')

  const { data: guide } = await supabase
    .from('tourist_guides')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!guide) redirect('/')

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const { data: rows } = await supabase
    .from('provider_availability')
    .select('date')
    .eq('provider_type', 'guide')
    .eq('provider_id', guide.id)
    .eq('status', 'unavailable')
    .gte('date', today)

  const unavailableDates = (rows ?? []).map((r) => r.date as string)
  const copy = guidesCopy.availability

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/mi-perfil-guia"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToPanel}
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>

        <AvailabilityCalendar
          providerType="guide"
          providerId={guide.id}
          action={setGuideAvailability}
          unavailableDates={unavailableDates}
          copy={copy}
        />
      </div>
    </main>
  )
}
