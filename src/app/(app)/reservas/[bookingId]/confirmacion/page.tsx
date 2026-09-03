import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Clock, XCircle, MessageCircle } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { bookingsCopy } from '@/lib/copy/bookings'
import { cn } from '@/lib/utils'
import { PendingPaymentPoller } from '@/components/reservas/PendingPaymentPoller'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type BookingDetail = {
  id: string
  booking_date: string
  quantity: number
  total_amount: number
  status: string
  created_at: string
  notes: string | null
  services: {
    name: string
    businesses: { name: string } | null
  } | null
  guide_tours: {
    name: string
    tourist_guides: { phone: string; profiles: { full_name: string | null } | null } | null
  } | null
  packages: { name: string } | null
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const STATUS_ICON: Record<string, React.ElementType> = {
  confirmed: CheckCircle2,
  pending_availability: Clock,
  pending_payment: Clock,
  cancelled: XCircle,
  completed: CheckCircle2,
}

const STATUS_ICON_CLASS: Record<string, string> = {
  confirmed: 'text-green-600 dark:text-green-400',
  pending_availability: 'text-indigo-600 dark:text-indigo-400',
  pending_payment: 'text-yellow-600 dark:text-yellow-400',
  cancelled: 'text-red-600 dark:text-red-400',
  completed: 'text-blue-600 dark:text-blue-400',
}

function getTitle(status: string): string {
  if (status === 'confirmed' || status === 'completed') {
    return bookingsCopy.confirmation.titleConfirmed
  }
  if (status === 'cancelled') return bookingsCopy.confirmation.titleCancelled
  if (status === 'pending_availability') return bookingsCopy.confirmation.titlePendingAvailability
  return bookingsCopy.confirmation.titlePending
}

function getSubtitle(status: string): string {
  if (status === 'confirmed' || status === 'completed') {
    return bookingsCopy.confirmation.subtitleConfirmed
  }
  if (status === 'cancelled') return bookingsCopy.confirmation.subtitleCancelled
  if (status === 'pending_availability') return bookingsCopy.confirmation.subtitlePendingAvailability
  return bookingsCopy.confirmation.subtitlePending
}

export default async function ConfirmacionPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params

  if (!UUID_RE.test(bookingId)) notFound()

  const supabase = await createClient()

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      'id, booking_date, quantity, total_amount, status, created_at, notes, services(name, businesses(name)), guide_tours(name, tourist_guides(phone, profiles!profile_id(full_name))), packages(name)',
    )
    .eq('id', bookingId)
    .single()

  if (error || !booking) notFound()

  const b = booking as unknown as BookingDetail
  const statusColors =
    bookingsCopy.list.statusColors[b.status] ??
    bookingsCopy.list.statusColors.pending_payment
  const statusLabel =
    bookingsCopy.list.status[b.status] ??
    bookingsCopy.list.status.pending_payment
  const StatusIcon = STATUS_ICON[b.status] ?? Clock
  const iconClass = STATUS_ICON_CLASS[b.status] ?? STATUS_ICON_CLASS.pending_payment

  const isPackage = b.packages != null
  const isGuideTour = b.guide_tours != null
  const serviceName = isPackage
    ? (b.packages?.name ?? '—')
    : isGuideTour
      ? (b.guide_tours?.name ?? '—')
      : (b.services?.name ?? '—')
  const businessName = isPackage
    ? 'ManTur'
    : isGuideTour
      ? (b.guide_tours?.tourist_guides?.profiles?.full_name ?? '—')
      : (b.services?.businesses?.name ?? '—')

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      {/* The Wompi webhook — not this page load — is the source of truth for
          payment status; it can resolve a few seconds after the browser
          lands here from Wompi's checkout redirect. This polls until the
          booking leaves pending_payment instead of requiring a manual reload. */}
      {b.status === 'pending_payment' && <PendingPaymentPoller />}
      <div className="mx-auto max-w-lg space-y-5">
        {/* Status icon + title */}
        <div className="flex flex-col items-center text-center pt-4 pb-2 space-y-3">
          <div
            className={cn(
              'flex items-center justify-center rounded-full bg-muted size-16',
            )}
          >
            <StatusIcon
              className={cn('size-8', iconClass)}
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {getTitle(b.status)}
          </h1>
          <p className="text-sm text-muted-foreground">{getSubtitle(b.status)}</p>
        </div>

        {/* Booking detail card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-4">
          {/* Status badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {bookingsCopy.confirmation.statusLabel}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                statusColors,
              )}
            >
              {statusLabel}
            </span>
          </div>

          <hr className="border-border" />

          {/* Details list */}
          <dl className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-sm text-muted-foreground shrink-0">
                {bookingsCopy.confirmation.bookingRef}
              </dt>
              <dd className="text-sm font-medium text-foreground font-mono">
                {b.id.slice(0, 8).toUpperCase()}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-3">
              <dt className="text-sm text-muted-foreground shrink-0">
                {isPackage ? bookingsCopy.confirmation.packageLabel : isGuideTour ? 'Tour' : bookingsCopy.confirmation.serviceLabel}
              </dt>
              <dd className="text-sm font-medium text-foreground text-right">
                {serviceName}
              </dd>
            </div>

            {!isPackage && (
            <div className="flex items-start justify-between gap-3">
              <dt className="text-sm text-muted-foreground shrink-0">
                {isGuideTour ? 'Guía' : bookingsCopy.confirmation.businessLabel}
              </dt>
              <dd className="text-sm font-medium text-foreground text-right">
                {businessName}
              </dd>
            </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground shrink-0">
                {bookingsCopy.confirmation.date}
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {formatDate(b.booking_date)}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground shrink-0">
                {bookingsCopy.confirmation.quantity}
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {b.quantity}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-muted-foreground shrink-0">
                {bookingsCopy.confirmation.total}
              </dt>
              <dd className="text-base font-semibold text-primary">
                ${Number(b.total_amount).toLocaleString('es-CO')} COP
              </dd>
            </div>
          </dl>
        </div>

        {/* Guide WhatsApp contact — only for guide tour bookings */}
        {isGuideTour && b.guide_tours?.tourist_guides?.phone && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-5 text-primary shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <p className="font-semibold text-foreground text-sm">{bookingsCopy.confirmation.guideContact}</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {bookingsCopy.confirmation.guideContactHint}
            </p>
            {b.notes && (
              <div className="rounded-xl bg-background border border-border px-3 py-2 space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">{bookingsCopy.confirmation.notesLabel}</p>
                <p className="text-sm text-foreground">{b.notes}</p>
              </div>
            )}
            <a
              href={`https://wa.me/57${b.guide_tours.tourist_guides.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white text-sm font-semibold min-h-11 hover:bg-[#1ebe59] transition-colors"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {bookingsCopy.confirmation.whatsappButton}
            </a>
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3 pt-1">
          <Link
            href="/mis-reservas"
            className="inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 hover:bg-primary/90 transition-colors"
          >
            {bookingsCopy.confirmation.myBookings}
          </Link>
          <Link
            href="/negocios"
            className="inline-flex w-full items-center justify-center min-h-11 text-sm text-primary underline-offset-4 hover:underline"
          >
            {bookingsCopy.confirmation.explore}
          </Link>
        </div>
      </div>
    </main>
  )
}
