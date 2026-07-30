export default function NegociosLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero skeleton */}
      <section className="px-4 py-8">
        <div className="h-8 w-56 rounded-lg bg-muted animate-pulse" />
        <div className="mt-2 h-5 w-72 rounded-lg bg-muted animate-pulse" />
      </section>

      {/* Grid skeleton */}
      <section className="px-4 mt-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden shadow-sm bg-card">
              <div className="aspect-[4/3] bg-muted animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-4 w-full rounded bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-xl bg-muted animate-pulse mt-3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
