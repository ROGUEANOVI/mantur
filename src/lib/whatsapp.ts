// ManTur's own WhatsApp number — the single advisory channel for the manual
// operation model (see docs/wompi-alegra-integration-plan.md and the
// 2026-09-02 business decision to run a WhatsApp+transfer manual flow while
// validating demand). Same number already used in the footer's social links
// (src/components/shared/SocialLinks.tsx).
export const MANTUR_WHATSAPP_NUMBER = '573217203264'

export function manturWhatsappUrl(message: string): string {
  return `https://wa.me/${MANTUR_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

// A direct link to a provider's own WhatsApp — bypasses ManTur entirely.
// Only for touchpoints where the provider, not ManTur, is meant to answer
// (an informational business's contact card, a confirmed booking's
// guide/business contact — see reservas/[bookingId]/confirmacion/page.tsx).
// `phone` is assumed already normalized (normalizeColombianPhone: 10 digits,
// no country code) — this only strips stray formatting and adds "57".
export function directWhatsappUrl(phone: string, message: string): string {
  return `https://wa.me/57${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}
