'use client'

import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { toast } from 'sonner'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminCopy } from '@/lib/copy/admin'
import { manturWhatsappUrl } from '@/lib/whatsapp'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import {
  setProviderAvailability,
  confirmPackagePrereserva,
  cancelPackagePrereserva,
  markPackageBookingPaid,
} from '@/app/(app)/admin/paquetes/solicitudes/actions'

const copy = adminCopy.paquetes.solicitudes

type ActionResult = { error: string } | void
type FormState = { error: string | null }
const initial: FormState = { error: null }

function useToastAction(action: (formData: FormData) => Promise<ActionResult>) {
  const [state, dispatch] = useActionState<FormState, FormData>(async (_prev, formData) => {
    const result = await action(formData)
    if (result && 'error' in result) return { error: result.error }
    return { error: null }
  }, initial)

  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state.error])

  return dispatch
}

function formatCOP(amount: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Item = {
  id: string
  label: string
  providerType: 'business' | 'guide'
  providerId: string
  isUnavailable: boolean
}

type Props = {
  bookingId: string
  packageName: string
  touristName: string
  touristPhone: string | null
  bookingDate: string
  quantity: number
  totalAmount: number
  notes: string | null
  // Only present for pending_availability bookings — undefined for
  // pending_payment ones, which only show the "mark paid" action.
  items?: Item[]
}

export default function PackageSolicitudCard({
  bookingId,
  packageName,
  touristName,
  touristPhone,
  bookingDate,
  quantity,
  totalAmount,
  notes,
  items,
}: Props) {
  const isAvailabilityStage = items !== undefined

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{packageName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {copy.touristLabel}: {touristName}
          </p>
        </div>
        {touristPhone && (
          <a
            href={manturWhatsappUrl(`Hola ${touristName}, te escribo por tu solicitud del paquete "${packageName}".`)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center rounded-lg bg-[#25D366] text-white p-2 hover:bg-[#1ebe59] transition-colors"
            aria-label={copy.whatsappContact}
          >
            <MessageCircle className="size-4" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{copy.dateLabel}: {formatDate(bookingDate)}</span>
        <span>{copy.quantityLabel}: {quantity}</span>
        <span className="font-semibold text-primary">{copy.totalLabel}: {formatCOP(totalAmount)}</span>
      </div>

      {notes && (
        <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
          <span className="font-medium">{copy.notesLabel}:</span> {notes}
        </p>
      )}

      {isAvailabilityStage ? (
        <AvailabilityStage bookingId={bookingId} bookingDate={bookingDate} items={items} />
      ) : (
        <PaymentStage bookingId={bookingId} />
      )}
    </div>
  )
}

function AvailabilityStage({
  bookingId,
  bookingDate,
  items,
}: {
  bookingId: string
  bookingDate: string
  items: Item[]
}) {
  const confirmDispatch = useToastAction(confirmPackagePrereserva)
  const cancelDispatch = useToastAction(cancelPackagePrereserva)
  const confirmFormId = `confirm-prereserva-${bookingId}`
  const cancelFormId = `cancel-prereserva-${bookingId}`

  return (
    <div className="space-y-3 pt-1 border-t border-border">
      <div className="pt-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{copy.includedTitle}</p>
        {items.map((item) => (
          <ProviderToggle key={item.id} bookingId={bookingId} bookingDate={bookingDate} item={item} />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <form id={confirmFormId} action={confirmDispatch}>
          <input type="hidden" name="bookingId" value={bookingId} />
        </form>
        <ConfirmDeleteButton
          formId={confirmFormId}
          title={copy.confirmChargeTitle}
          description={copy.confirmChargeDescription}
          confirmLabel={copy.confirmAndCharge}
          trigger={copy.confirmAndCharge}
          triggerClassName="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold min-h-[36px] px-3 hover:bg-primary/90 transition-colors"
        />

        <form id={cancelFormId} action={cancelDispatch}>
          <input type="hidden" name="bookingId" value={bookingId} />
        </form>
        <ConfirmDeleteButton
          formId={cancelFormId}
          title={copy.confirmCancelTitle}
          description={copy.confirmCancelDescription}
          confirmLabel={copy.cancelRequest}
          trigger={copy.cancelRequest}
          triggerClassName="shrink-0 rounded-lg border border-destructive/40 text-xs font-medium text-destructive px-3 min-h-[36px] hover:bg-destructive/10 transition-colors"
        />
      </div>
    </div>
  )
}

function ProviderToggle({
  bookingId,
  bookingDate,
  item,
}: {
  bookingId: string
  bookingDate: string
  item: Item
}) {
  const dispatch = useToastAction(setProviderAvailability)
  const nextStatus = item.isUnavailable ? 'available' : 'unavailable'

  return (
    <form action={dispatch} className="flex items-center justify-between gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="providerType" value={item.providerType} />
      <input type="hidden" name="providerId" value={item.providerId} />
      <input type="hidden" name="date" value={bookingDate} />
      <input type="hidden" name="status" value={nextStatus} />

      <span className="text-sm text-foreground flex items-center gap-1.5 min-w-0">
        <span className="truncate">{item.label}</span>
        {item.isUnavailable && (
          <span className="shrink-0 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 text-[10px] font-semibold">
            {copy.unavailableBadge}
          </span>
        )}
      </span>

      <SubmitButton
        className={cn(
          'shrink-0 rounded-lg border text-xs font-medium px-2.5 min-h-[32px] transition-colors',
          item.isUnavailable
            ? 'border-primary/30 text-primary hover:bg-primary/10'
            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
        )}
        label={item.isUnavailable ? copy.markAvailable : copy.markUnavailable}
      />
    </form>
  )
}

function PaymentStage({ bookingId }: { bookingId: string }) {
  const dispatch = useToastAction(markPackageBookingPaid)
  const formId = `mark-paid-${bookingId}`

  return (
    <div className="pt-3 border-t border-border">
      <form id={formId} action={dispatch}>
        <input type="hidden" name="bookingId" value={bookingId} />
      </form>
      <ConfirmDeleteButton
        formId={formId}
        title={copy.confirmMarkPaidTitle}
        description={copy.confirmMarkPaidDescription}
        confirmLabel={copy.markPaid}
        trigger={copy.markPaid}
        triggerClassName="w-full inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-semibold min-h-[36px] px-3 hover:bg-primary/90 transition-colors"
      />
    </div>
  )
}

// Plain HTML submit buttons (not the shared <Button> component, matching
// this admin section's existing convention of small inline text buttons —
// see /admin/paquetes/page.tsx's activate/deactivate button). useFormStatus()
// only sees the nearest parent <form>, so this must be its own component
// rendered *inside* each <form> above, not inline in the parent.
function SubmitButton({ className, label }: { className: string; label: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending}>
      {label}
    </button>
  )
}
