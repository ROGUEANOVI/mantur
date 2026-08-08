import Link from 'next/link'
import ManturLogo from '@/components/shared/ManturLogo'
import { authCopy } from '@/lib/copy/auth'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-gradient-to-b from-[#0a2b1e] via-[#0d1f2d] to-[#091b27]">
      {/* decorative circles — same treatment as the landing hero */}
      <div className="pointer-events-none absolute -top-16 -right-16 size-72 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 size-48 rounded-full bg-white/5" />

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

      {/* Form card */}
      <div className="animate-fade-up [animation-delay:120ms] relative max-w-md w-full mx-auto bg-card rounded-2xl shadow-2xl p-6 md:p-8">
        {children}
      </div>
    </div>
  )
}
