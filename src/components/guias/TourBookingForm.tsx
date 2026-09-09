import { guidesCopy } from '@/lib/copy/guides'
import WhatsappButton from '@/components/shared/WhatsappButton'
import GuideTourPrereservaForm from '@/components/guias/GuideTourPrereservaForm'

type BookingAccess = 'tourist' | 'guest' | 'other_role'

type Props = {
  tourId: string
  tourName: string
  guideName: string
  price: number
  capacity: number
  blockedDates: string[]
  access: BookingAccess
}

const copy = guidesCopy.bookingForm

// Direct in-platform PAYMENT is still disabled during ManTur's manual-
// operation validation phase (2026-09-02 business decision — see project
// memory manual_operation_pivot). What changed (Fase C of the item-level
// availability plan): the founder now has real, checked availability per
// tour (BlockedDatesPicker + is_item_available() server-side), so a
// pre-reserva request — no charge, booking lands directly at 'confirmed'
// for WhatsApp coordination — no longer needs to wait for that. The
// WhatsApp button stays as a secondary "prefiero coordinar directo" path
// for a tourist who'd rather just message first.
export default function TourBookingForm({ tourId, tourName, guideName, price, capacity, blockedDates, access }: Props) {
  // Same posture as before Fase C: a business owner/admin browsing tours
  // gets no contact CTA at all here, not just a hidden booking form.
  if (access === 'other_role') return null

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <GuideTourPrereservaForm
        tourId={tourId}
        price={price}
        capacity={capacity}
        blockedDates={blockedDates}
        access={access}
      />
      <WhatsappButton
        className={access === 'tourist' ? 'bg-transparent border border-[#25D366] text-[#1ebe59] hover:bg-[#25D366]/10 hover:text-[#1ebe59]' : undefined}
        message={`Hola, quiero más información sobre el tour "${tourName}" con ${guideName} (precio: $${price.toLocaleString('es-CO')} COP por persona).`}
        label={copy.contactWhatsapp}
      />
    </div>
  )
}
