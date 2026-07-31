export default function LugaresLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28]">
        <svg
          className="pointer-events-none absolute bottom-0 left-0 w-full opacity-[0.13]"
          viewBox="0 0 1200 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,90 L120,52 L240,70 L380,28 L500,55 L620,10 L740,42 L860,18 L980,48 L1100,22 L1200,38 L1200,90 Z"
            fill="white"
          />
        </svg>
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-5 text-center space-y-4">
          <div className="space-y-2">
            <div className="h-7 w-52 rounded-lg bg-white/20 animate-pulse mx-auto" />
            <div className="h-4 w-72 rounded-lg bg-white/10 animate-pulse mx-auto" />
          </div>
          <div className="h-10 w-full rounded-xl bg-white/15 animate-pulse" />
        </div>
        <div className="border-t border-white/10 py-3">
          <div className="flex flex-wrap justify-center gap-2 px-4 max-w-4xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-20 rounded-full bg-white/15 animate-pulse" />
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
                <div className="h-3 w-16 rounded-full bg-muted animate-pulse" />
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
