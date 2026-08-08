import Link from 'next/link'
import PublicNav from '@/components/layout/PublicNav'
import { landingCopy } from '@/lib/copy/landing'

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
      <footer className="border-t border-border px-4 py-8 text-center space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{footer.tagline}</p>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
          <Link href="/descubre" className="text-xs font-medium text-primary hover:underline">
            Guías de viaje
          </Link>
          <Link href="/acerca-de-nosotros" className="text-xs font-medium text-primary hover:underline">
            Acerca de nosotros
          </Link>
          <Link href="/terminos-y-condiciones" className="text-xs font-medium text-primary hover:underline">
            Términos y condiciones
          </Link>
          <Link href="/politica-de-privacidad" className="text-xs font-medium text-primary hover:underline">
            Política de privacidad
          </Link>
        </div>
        <p className="text-xs text-muted-foreground/60">{footer.rights}</p>
      </footer>
    </div>
  )
}
