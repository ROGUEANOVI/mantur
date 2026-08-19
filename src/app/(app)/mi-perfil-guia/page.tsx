import Link from 'next/link'
import { Plus, Clock, Users, Pencil, CalendarDays, Banknote, Phone, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { guidesCopy } from '@/lib/copy/guides'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { cn } from '@/lib/utils'
import GuideAvailabilityToggle from '@/components/guias/GuideAvailabilityToggle'
import { toggleTourStatus } from './actions'

type Guide = {
  id: string
  is_available: boolean
  bio: string | null
  phone: string
  specialties: string[]
  languages: string[]
  profiles: { full_name: string | null } | null
}

type Tour = {
  id: string
  name: string
  description: string | null
  price: number | string
  capacity: number
  duration_minutes: number | null
  status: string
}

type BookingRow = {
  id: string
  booking_date: string
  quantity: number
  total_amount: number
  status: string
  notes: string | null
  guide_tours: { name: string } | null
  profiles: { full_name: string | null } | null
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function MiPerfilGuiaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: guideData } = await supabase
    .from('tourist_guides')
    .select('id, is_available, bio, phone, specialties, languages, profiles(full_name)')
    .eq('profile_id', user!.id)
    .single()

  const guide = guideData as unknown as Guide | null
  if (!guide) return null

  const [toursResult, bookingsResult] = await Promise.all([
    supabase
      .from('guide_tours')
      .select('id, name, description, price, capacity, duration_minutes, status')
      .eq('guide_id', guide.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, booking_date, quantity, total_amount, status, notes, guide_tours(name), profiles!tourist_id(full_name)')
      .eq('guide_id', guide.id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const tours = (toursResult.data ?? []) as unknown as Tour[]
  const bookings = (bookingsResult.data ?? []) as unknown as BookingRow[]
  const copy = guidesCopy.guidePanel

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">

        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-foreground">{copy.pageTitle}</h1>
            <Link
              href="/mi-perfil-guia/editar"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="size-4" aria-hidden="true" />
              Editar
            </Link>
          </div>

          <div className="space-y-3">
            {/* Availability toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{copy.availabilityLabel}</span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    guide.is_available ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {guide.is_available ? copy.available : copy.notAvailable}
                </span>
                <GuideAvailabilityToggle isAvailable={guide.is_available} />
              </div>
            </div>

            {guide.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-foreground font-medium">{guide.phone}</span>
              </div>
            )}

            {guide.specialties.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">{copy.specialtiesLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  {guide.specialties.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                    >
                      {roleRequestsCopy.form.touristGuide.specialtyOptions[s as keyof typeof roleRequestsCopy.form.touristGuide.specialtyOptions] ?? s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {guide.languages.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">{copy.languagesLabel}</p>
                <div className="flex flex-wrap gap-1.5">
                  {guide.languages.map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      {roleRequestsCopy.form.touristGuide.languageOptions[l as keyof typeof roleRequestsCopy.form.touristGuide.languageOptions] ?? l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {guide.bio && (
              <p className="text-sm text-muted-foreground border-t border-border pt-3">
                {guide.bio}
              </p>
            )}
          </div>
        </div>

        {/* Tours section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-foreground">{copy.toursSection}</h2>
            <Link
              href="/mi-perfil-guia/tours/nueva"
              className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-primary text-primary-foreground text-sm font-medium px-3 min-h-11 hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-4" aria-hidden="true" />
              {copy.addTour}
            </Link>
          </div>

          {tours.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{copy.emptyTours}</p>
          ) : (
            <div className="space-y-3">
              {tours.map((tour) => {
                const isActive = tour.status === 'active'
                return (
                  <div
                    key={tour.id}
                    className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
                        {tour.name}
                      </h3>
                      <span
                        className={cn(
                          'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          isActive
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                        )}
                      >
                        {isActive ? copy.statusActive : copy.statusInactive}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-base font-semibold text-accent">
                        ${Number(tour.price).toLocaleString('es-CO')} COP
                      </p>
                      {tour.duration_minutes != null && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {tour.duration_minutes}&nbsp;min
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3.5" aria-hidden="true" />
                        {tour.capacity}&nbsp;máx.
                      </span>
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-3">
                      <form action={toggleTourStatus}>
                        <input type="hidden" name="tourId" value={tour.id} />
                        <button
                          type="submit"
                          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-11 py-2"
                        >
                          {isActive ? copy.toggleInactive : copy.toggleActive}
                        </button>
                      </form>
                      <Link
                        href={`/mi-perfil-guia/tours/${tour.id}/editar`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors min-h-11 py-2"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        {copy.editTour}
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Recent bookings section */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">{copy.bookingsSection}</h2>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{copy.emptyBookings}</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-2"
                >
                  <p className="font-semibold text-sm text-foreground line-clamp-1">
                    {b.guide_tours?.name ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {copy.tourist}: {b.profiles?.full_name ?? '—'}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                      {formatDate(b.booking_date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden="true" />
                      {b.quantity}&nbsp;{copy.people}
                    </span>
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <Banknote className="size-3.5" aria-hidden="true" />
                      ${Number(b.total_amount).toLocaleString('es-CO')} COP
                    </span>
                  </div>
                  {b.notes && (
                    <div className="rounded-lg bg-muted px-2.5 py-1.5 space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">{copy.notesLabel}</p>
                      <p className="text-xs text-foreground leading-relaxed">{b.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  )
}
