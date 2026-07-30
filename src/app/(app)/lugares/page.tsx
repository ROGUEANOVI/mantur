import { TreePine } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'

type PlaceRow = {
  id: string
  name: string
  description: string | null
  type: string
  images: string[] | null
}

export default async function LugaresPage() {
  const supabase = await createClient()

  // RLS allows public SELECT on places
  const { data: places } = await supabase
    .from('places')
    .select('id, name, description, type, images')
    .order('name')

  const copy = businessesCopy.places

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Hero */}
      <section className="px-4 py-8 bg-gradient-to-br from-primary/10 to-accent/10">
        <h1 className="text-2xl font-bold text-foreground">{copy.pageTitle}</h1>
        <p className="mt-1 text-base text-muted-foreground">{copy.pageSubtitle}</p>
      </section>

      {/* Places list */}
      <section className="px-4 mt-6">
        {!places || places.length === 0 ? (
          <EmptyState message={copy.empty} />
        ) : (
          <div className="space-y-3">
            {(places as PlaceRow[]).map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function PlaceCard({ place }: { place: PlaceRow }) {
  const copy = businessesCopy.places
  const imageUrl = place.images?.[0]
  const typeLabel = copy.types[place.type] ?? copy.types.other

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-card border border-border flex items-center gap-3 p-3">
      {/* Square thumbnail */}
      <div className="relative size-20 rounded-xl overflow-hidden shrink-0">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={place.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <TreePine
              className="size-8 text-primary/60"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <h3 className="font-semibold text-foreground text-sm leading-snug">
            {place.name}
          </h3>
          <span
            className={cn(
              'bg-secondary text-secondary-foreground',
              'text-xs font-medium px-2 py-0.5 rounded-full shrink-0'
            )}
          >
            {typeLabel}
          </span>
        </div>

        {place.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mt-0.5">
            {place.description}
          </p>
        )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <TreePine
        className="size-12 text-muted-foreground/40"
        aria-hidden="true"
        strokeWidth={1.5}
      />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  )
}
