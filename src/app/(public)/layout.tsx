import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import { landingCopy } from '@/lib/copy/landing'
import ManturLogo from '@/components/shared/ManturLogo'
import SocialLinks from '@/components/shared/SocialLinks'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { footer } = landingCopy
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <footer className="bg-[#0a2b1e] text-white/90">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <ManturLogo size="md" />
              <p className="mt-3 max-w-xs text-sm text-white/60">{footer.tagline}</p>
              <SocialLinks className="mt-5" />
            </div>

            <nav aria-label="Explora ManTur">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Explora
              </h3>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li><Link href="/negocios" className="text-white/75 transition-colors hover:text-white">Negocios</Link></li>
                <li><Link href="/lugares" className="text-white/75 transition-colors hover:text-white">Lugares imperdibles</Link></li>
                <li><Link href="/guias" className="text-white/75 transition-colors hover:text-white">Guías turísticos</Link></li>
                <li><Link href="/transportistas" className="text-white/75 transition-colors hover:text-white">Transportadores</Link></li>
              </ul>
            </nav>

            <nav aria-label="Información legal">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Información
              </h3>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li><Link href="/descubre" className="text-white/75 transition-colors hover:text-white">Guías de viaje</Link></li>
                <li><Link href="/acerca-de-nosotros" className="text-white/75 transition-colors hover:text-white">Acerca de nosotros</Link></li>
                <li><Link href="/terminos-y-condiciones" className="text-white/75 transition-colors hover:text-white">Términos y condiciones</Link></li>
                <li><Link href="/politica-de-privacidad" className="text-white/75 transition-colors hover:text-white">Política de privacidad</Link></li>
              </ul>
            </nav>
          </div>

          <div className="mt-10 border-t border-white/10 pt-6 text-center">
            <p className="text-xs text-white/40">{footer.rights}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
