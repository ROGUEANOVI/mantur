// ManTur's own WhatsApp number — the single advisory channel for the manual
// operation model (see docs/wompi-alegra-integration-plan.md and the
// 2026-09-02 business decision to run a WhatsApp+transfer manual flow while
// validating demand). Same number already used in the footer's social links
// (src/components/shared/SocialLinks.tsx).
export const MANTUR_WHATSAPP_NUMBER = '573217203264'

export function manturWhatsappUrl(message: string): string {
  return `https://wa.me/${MANTUR_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
