import { FaInstagram, FaFacebook, FaWhatsapp, FaTiktok } from 'react-icons/fa6'
import { MANTUR_WHATSAPP_NUMBER } from '@/lib/whatsapp'

const SOCIAL_LINKS = [
  { name: 'Instagram', href: 'https://instagram.com/mantur.oficial', Icon: FaInstagram },
  { name: 'Facebook', href: 'https://www.facebook.com/share/196SHnZWw5/', Icon: FaFacebook },
  { name: 'WhatsApp', href: `https://wa.me/${MANTUR_WHATSAPP_NUMBER}`, Icon: FaWhatsapp },
  { name: 'TikTok', href: 'https://www.tiktok.com/@mantur432', Icon: FaTiktok },
]

export default function SocialLinks({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex items-center gap-3 ${className}`}>
      {SOCIAL_LINKS.map(({ name, href, Icon }) => (
        <li key={name}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Síguenos en ${name}`}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
          >
            <Icon size={18} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  )
}
