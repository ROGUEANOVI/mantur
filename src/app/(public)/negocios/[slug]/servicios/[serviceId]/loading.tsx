export default function ServicioDetailLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="px-4 pt-4">
        <div className="h-6 w-20 rounded bg-muted animate-pulse" />
      </div>
      <div className="mx-4 mt-2 h-56 md:h-72 rounded-2xl bg-muted animate-pulse" />
      <div className="px-4 mt-6 space-y-3">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="h-6 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
        <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        <div className="h-4 w-36 rounded bg-muted animate-pulse" />
        <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />
      </div>
    </main>
  )
}
