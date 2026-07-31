export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
     * The gradient evokes Manaure's mountain forests (deep green) transitioning
     * to the warm amber light of the Colombian highlands.
     * Three-stop gradient: dark green → olive mid-tone → warm amber.
     */
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-emerald-800 via-teal-700 to-cyan-800">
      {/* Brand header — sits above the form card, always visible */}
      <div className="mb-8 text-center select-none">
        <p className="text-4xl font-bold tracking-tight text-white">ManTur</p>
        <p className="mt-1 text-sm font-medium text-white/60 tracking-wide uppercase">
          Manaure Balcón del Cesar
        </p>
      </div>

      {/* Form card */}
      <div className="max-w-md w-full mx-auto bg-card rounded-2xl shadow-2xl p-6 md:p-8">
        {children}
      </div>
    </div>
  )
}
