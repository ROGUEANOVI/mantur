export default function LugaresLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <section className="px-4 py-8">
        <div className="h-8 w-56 rounded-lg bg-muted animate-pulse" />
        <div className="mt-2 h-5 w-72 rounded-lg bg-muted animate-pulse" />
      </section>
      <section className="px-4 mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden border border-border flex items-center gap-3 p-3 bg-card"
          >
            <div className="size-20 rounded-xl bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}
