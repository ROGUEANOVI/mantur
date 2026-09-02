import { guidesCopy } from '@/lib/copy/guides'
import WhatsappButton from '@/components/shared/WhatsappButton'

type BookingAccess = 'tourist' | 'guest' | 'other_role'

type Props = {
  tourName: string
  guideName: string
  price: number
  access: BookingAccess
}

const copy = guidesCopy.bookingForm

// Direct in-platform booking is disabled during ManTur's manual-operation
// validation phase (2026-09-02 business decision) — the founder has no
// reliable way to confirm a guide's real availability yet, so this now
// routes to ManTur's own WhatsApp for manual coordination instead of
// createGuideTourBooking(). No longer needs client interactivity (no form,
// no router), so this is a plain Server Component. The booking Server
// Action and its schema are untouched and can be wired back in later.
export default function TourBookingForm({ tourName, guideName, price, access }: Props) {
  if (access === 'other_role') return null

  return (
    <div className="border-t border-border pt-4">
      <WhatsappButton
        message={`Hola, quiero más información sobre el tour "${tourName}" con ${guideName} (precio: $${price.toLocaleString('es-CO')} COP por persona).`}
        label={copy.contactWhatsapp}
      />
    </div>
  )
}
