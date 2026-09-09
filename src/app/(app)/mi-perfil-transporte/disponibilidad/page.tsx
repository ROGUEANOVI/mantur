import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'
import AvailabilityCalendar from '@/components/shared/AvailabilityCalendar'
import WeeklyAvailabilityPattern from '@/components/shared/WeeklyAvailabilityPattern'
import { setTransporterAvailability, setTransporterWeeklyAvailability } from '../actions'

export default async function TransporterAvailabilityPage() {
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

  if (profile?.role !== 'transporter') redirect('/')

  const { data: transporter } = await supabase
    .from('transporters')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!transporter) redirect('/')

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const [dateRows, weeklyRows] = await Promise.all([
    supabase
      .from('provider_availability')
      .select('date')
      .eq('provider_type', 'transporter')
      .eq('provider_id', transporter.id)
      .eq('status', 'unavailable')
      .gte('date', today),
    supabase
      .from('provider_weekly_availability')
      .select('weekday')
      .eq('provider_type', 'transporter')
      .eq('provider_id', transporter.id)
      .eq('status', 'unavailable'),
  ])

  const unavailableDates = (dateRows.data ?? []).map((r) => r.date as string)
  const unavailableWeekdays = (weeklyRows.data ?? []).map((r) => r.weekday as number)
  const copy = transportCopy.availability

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/mi-perfil-transporte"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToPanel}
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{copy.subtitle}</p>
        </div>

        <WeeklyAvailabilityPattern
          providerType="transporter"
          providerId={transporter.id}
          action={setTransporterWeeklyAvailability}
          unavailableWeekdays={unavailableWeekdays}
          copy={copy}
        />

        <AvailabilityCalendar
          providerType="transporter"
          providerId={transporter.id}
          action={setTransporterAvailability}
          unavailableDates={unavailableDates}
          copy={copy}
        />
      </div>
    </main>
  )
}
