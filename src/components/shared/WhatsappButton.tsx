import { MessageCircle } from 'lucide-react'
import { manturWhatsappUrl, directWhatsappUrl } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'

type Props = {
  message: string
  label: string
  className?: string
  // Omit for the default ManTur-mediated inquiry (ServiceCard: the tourist's
  // question about a bookable service goes through ManTur's own WhatsApp,
  // per the manual-sales operating model). Pass the provider's own phone to
  // link directly to them instead — for a business that isn't part of that
  // flow at all (an informational business's contact card).
  phone?: string | null
}

// Same visual pattern already used for the guide-contact WhatsApp button on
// the booking confirmation page — kept identical here for consistency
// across the app's WhatsApp touchpoints.
export default function WhatsappButton({ message, label, className, phone }: Props) {
  return (
    <a
      href={phone ? directWhatsappUrl(phone, message) : manturWhatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white text-sm font-semibold min-h-11 hover:bg-[#1ebe59] active:scale-[0.98] transition-all',
        className,
      )}
    >
      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </a>
  )
}
