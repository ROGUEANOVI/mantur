import AuroraHero from '@/components/shared/AuroraHero'
import HeroControlCard from '@/components/shared/HeroControlCard'

export default function LugaresLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <AuroraHero>
        <div className="h-7 w-52 rounded-lg bg-white/20 animate-pulse mx-auto" />
        <div className="mt-2 h-4 w-72 rounded-lg bg-white/15 animate-pulse mx-auto" />
      </AuroraHero>
      <div className="hero-weave-edge" />

      <HeroControlCard>
        <div className="h-10 w-full rounded-xl bg-muted animate-pulse" />
        <div className="mt-3 flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
      </HeroControlCard>

      <div className="max-w-5xl mx-auto w-full mt-6 px-4">
        <div className="flex justify-center mb-4">
          <div className="h-9 w-40 rounded-full bg-muted animate-pulse" />
        </div>
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
