export default function NegociosLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="relative overflow-hidden bg-gradient-to-br from-accent via-accent to-[#c9860f]">
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.10]"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,80 L0,55 L60,55 L60,40 L80,40 L80,30 L100,30 L100,40 L130,40 L130,55
               L200,55 L200,35 L215,35 L215,20 L230,20 L230,35 L260,35 L260,55
               L320,55 L320,45 L345,45 L345,55 L400,55 L400,38 L420,38 L420,25 L440,25 L440,38 L470,38 L470,55
               L540,55 L540,42 L560,42 L560,55 L600,55 L600,30 L618,30 L618,18 L636,18 L636,30 L660,30 L660,55
               L720,55 L720,45 L750,45 L750,55 L800,55 L800,35 L820,35 L820,22 L840,22 L840,35 L870,35 L870,55
               L930,55 L930,42 L950,42 L950,55 L1000,55 L1000,40 L1020,40 L1020,28 L1045,28 L1045,40 L1070,40 L1070,55
               L1140,55 L1140,45 L1165,45 L1165,55 L1200,55 L1200,80 Z"
            fill="#0a2b1e"
          />
        </svg>
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-5 text-center space-y-4">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg bg-[#0a2b1e]/15 animate-pulse mx-auto" />
            <div className="h-4 w-64 rounded-lg bg-[#0a2b1e]/10 animate-pulse mx-auto" />
          </div>
          <div className="h-10 w-full rounded-xl bg-white/50 animate-pulse" />
        </div>
        <div className="border-t border-[#0a2b1e]/10 py-3">
          <div className="flex flex-wrap justify-center gap-2 px-4 max-w-4xl mx-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-[#0a2b1e]/10 animate-pulse" />
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto w-full mt-4 px-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-card border border-border overflow-hidden
                         flex items-center gap-3 p-3 sm:flex-col sm:p-0"
            >
              {/* Image */}
              <div className="size-24 rounded-xl bg-muted animate-pulse shrink-0 sm:size-auto sm:rounded-none sm:aspect-[4/3] sm:w-full" />
              {/* Content */}
              <div className="flex-1 space-y-2 py-1 sm:p-4">
                <div className="h-3 w-14 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-full rounded bg-muted animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
