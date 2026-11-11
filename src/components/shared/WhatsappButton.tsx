'use client'

import { MessageCircle } from 'lucide-react'
import { manturWhatsappUrl, directWhatsappUrl } from '@/lib/whatsapp'
import { track, type TrackEventMap } from '@/lib/analytics/track'
import { campaignTag, readAttribution } from '@/lib/analytics/attribution'
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
  // Round icon-only button for tight spots where WhatsApp is the secondary
  // action (PackageShowcase cards). The label stays as the accessible name.
  iconOnly?: boolean
  // ManTur sales touchpoints pass this: the click is tracked as a lead
  // (whatsapp_click → GA4 generate_lead / Meta Contact) and the campaign
  // that brought the visitor is appended to the message, so the admin can
  // record it when registering the sale. Never set for a provider's phone.
  tracking?: TrackEventMap['whatsapp_click']
}

// Same visual pattern already used for the guide-contact WhatsApp button on
// the booking confirmation page — kept identical here for consistency
// across the app's WhatsApp touchpoints.
export default function WhatsappButton({ message, label, className, phone, iconOnly = false, tracking }: Props) {
  const href = phone ? directWhatsappUrl(phone, message) : manturWhatsappUrl(message)

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!tracking || phone) return
    track('whatsapp_click', tracking)
    const tag = campaignTag(readAttribution())
    // Rewrite the link just before the browser follows it, so the server
    // render stays identical for every visitor.
    if (tag) e.currentTarget.href = manturWhatsappUrl(`${message} · campaña: ${tag}`)
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={cn(
        'relative z-10 inline-flex items-center justify-center gap-2 bg-[#25D366] text-white text-sm font-semibold min-h-11 hover:bg-[#1ebe59] active:scale-[0.98] transition-all',
        iconOnly ? 'size-11 shrink-0 rounded-full' : 'w-full rounded-xl',
        className,
      )}
    >
      <MessageCircle className={iconOnly ? 'size-5 shrink-0' : 'size-4 shrink-0'} aria-hidden="true" />
      {!iconOnly && label}
    </a>
  )
}
