import ManturLogo from '@/components/shared/ManturLogo'
import { authCopy } from '@/lib/copy/auth'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-[#0a2b1e] via-[#0d1f2d] to-[#091b27]">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <ManturLogo size="lg" />
        <p className="mt-3 text-sm text-white/55 italic tracking-wide">
          {authCopy.brand.tagline}
        </p>
      </div>

      {/* Form card */}
      <div className="max-w-md w-full mx-auto bg-card rounded-2xl shadow-2xl p-6 md:p-8">
        {children}
      </div>
    </div>
  )
}
