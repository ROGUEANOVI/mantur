import AuroraHero from '@/components/shared/AuroraHero'
import HeroControlCard from '@/components/shared/HeroControlCard'

export default function PaquetesLoading() {
  return (
    <main className="min-h-screen bg-background pb-10">
      <AuroraHero>
        <div className="h-7 w-52 rounded-lg bg-white/20 animate-pulse mx-auto" />
        <div className="mt-2 h-4 w-72 rounded-lg bg-white/15 animate-pulse mx-auto" />
      </AuroraHero>
      <div className="hero-weave-edge" />

      <HeroControlCard>
        <div className="h-10 w-full rounded-xl bg-muted animate-pulse" />
      </HeroControlCard>

      <div className="max-w-5xl mx-auto w-full mt-6 px-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-card border border-border overflow-hidden animate-pulse"
            >
              <div className="aspect-[4/3] bg-muted" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
