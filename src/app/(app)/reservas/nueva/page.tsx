import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { bookingsCopy } from '@/lib/copy/bookings'
import { businessesCopy } from '@/lib/copy/businesses'
import BookingForm from '@/components/reservas/BookingForm'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ExperienceWithBusiness = {
  id: string
  name: string
  price: number
  capacity: number | null
  status: string
  business_id: string
  businesses: { name: string } | null
}

export default async function NuevaReservaPage({
  searchParams,
}: {
  searchParams: Promise<{ exp?: string }>
}) {
  const { exp: expId } = await searchParams

  if (!expId || !UUID_RE.test(expId)) {
    redirect('/negocios')
  }

  const supabase = await createClient()

  const { data: experience, error } = await supabase
    .from('experiences')
    .select('id, name, price, capacity, status, business_id, businesses(name)')
    .eq('id', expId)
    .eq('status', 'active')
    .single()

  if (error || !experience) notFound()

  const exp = experience as unknown as ExperienceWithBusiness
  const businessName = exp.businesses?.name ?? ''

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        {/* Back link */}
        <Link
          href="/negocios"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline mb-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {businessesCopy.detail.back}
        </Link>

        {/* Page header */}
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            {bookingsCopy.form.title}
          </h1>
          {businessName && (
            <p className="text-sm text-muted-foreground">{businessName}</p>
          )}
        </div>

        {/* Price per person callout */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-4 mb-5">
          <p className="text-sm text-muted-foreground">
            {bookingsCopy.form.perPerson}
          </p>
          <p className="text-xl font-semibold text-primary mt-0.5">
            ${Number(exp.price).toLocaleString('es-CO')} COP
          </p>
          <p className="text-sm font-semibold text-foreground mt-1 line-clamp-1">
            {exp.name}
          </p>
        </div>

        {/* Booking form */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <BookingForm
            experienceId={exp.id}
            price={Number(exp.price)}
            capacity={exp.capacity}
            experienceName={exp.name}
          />
        </div>
      </div>
    </main>
  )
}
