export default function NegocioDetailLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="px-4 pt-4">
        <div className="h-6 w-20 rounded bg-muted animate-pulse" />
      </div>
      <div className="mx-4 mt-2 h-56 md:h-72 rounded-2xl bg-muted animate-pulse" />
      <div className="px-4 mt-6 space-y-3">
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
        <div className="h-5 w-4/5 rounded bg-muted animate-pulse" />
        <div className="h-4 w-52 rounded bg-muted animate-pulse" />
        <div className="h-4 w-36 rounded bg-muted animate-pulse" />
      </div>
      <div className="px-4 mt-8 space-y-3">
        <div className="h-6 w-48 rounded bg-muted animate-pulse mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border border-border flex">
            <div className="w-24 min-h-[96px] bg-muted animate-pulse shrink-0" />
            <div className="flex-1 p-4 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-3 w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
              <div className="h-5 w-24 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
