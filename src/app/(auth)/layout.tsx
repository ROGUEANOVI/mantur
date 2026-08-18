import Link from 'next/link'
import ManturLogo from '@/components/shared/ManturLogo'
import { authCopy } from '@/lib/copy/auth'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-gradient-to-b from-[#0d1f2d] to-[#0a2b1e]">
      {/* Aurora sutil — faint amber glow behind the header, echoing the sun
          dot in ManturLogo. Kept intentionally understated: a soft radial
          fade, not a visible blob. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_480px_320px_at_50%_15%,rgba(232,160,32,0.09),transparent_70%)]"
        aria-hidden="true"
      />

      {/* Brand header — logo doubles as the way back to the landing page.
          No nav on auth screens by design (keeps focus on the form), but the
          logo-links-home convention is universal enough that it doesn't need
          explaining, and it's the only escape hatch these pages have. */}
      <div className="animate-fade-up relative mb-8 text-center">
        <Link href="/" aria-label="ManTur — volver al inicio" className="inline-block transition-opacity hover:opacity-80">
          <ManturLogo size="lg" />
        </Link>
        <p className="mt-3 text-sm text-white/55 italic tracking-wide">
          {authCopy.brand.tagline}
        </p>
      </div>

      {children}
    </div>
  )
}
