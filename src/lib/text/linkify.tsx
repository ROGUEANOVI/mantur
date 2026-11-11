import type { ReactNode } from 'react'
import { directWhatsappUrl } from '@/lib/whatsapp'

// Free-text descriptions (packages, businesses, places) are written by
// admins/owners in a plain textarea and often include a web link or a
// WhatsApp number typed as text ("escríbenos al 3001006725"). This turns
// both into real links without allowing any HTML: the input is only ever
// split into strings and <a> elements, never injected as markup.

// http(s) URLs, stopping before trailing punctuation that usually ends a
// sentence rather than the URL.
const URL_PART = String.raw`https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]`
// Colombian mobile: 10 digits starting with 3, optionally "+57"/"57" and
// space/dash separators (300 100 6725, 300-100-6725, +57 3001006725). The
// lookarounds keep it from matching inside longer digit runs (IDs, NITs).
const PHONE_PART = String.raw`(?<![\d.])(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}(?![\d.])`

const TOKEN_RE = new RegExp(`(${URL_PART})|(${PHONE_PART})`, 'g')

const LINK_CLASS = 'font-medium text-primary underline underline-offset-2 hover:no-underline'

export function linkifyText(text: string, whatsappMessage = 'Hola, vi su información en ManTur.'): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(TOKEN_RE)) {
    const [token, url, phone] = match
    const start = match.index ?? 0
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

    if (url) {
      nodes.push(
        <a key={start} href={url} target="_blank" rel="noopener noreferrer nofollow" className={LINK_CLASS}>
          {url}
        </a>,
      )
    } else if (phone) {
      const digits = phone.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '')
      nodes.push(
        <a
          key={start}
          href={directWhatsappUrl(digits, whatsappMessage)}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          {phone}
        </a>,
      )
    } else {
      nodes.push(token)
    }

    lastIndex = start + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
