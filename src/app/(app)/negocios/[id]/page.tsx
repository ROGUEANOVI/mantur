import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Phone, Store, ChevronLeft, Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'

type ExperienceRow = {
  id: string
  name: string
  description: string | null
  price: number
  capacity: number | null
  duration_minutes: number | null
  images: string[] | null
  status: string
}

type BusinessDetail = {
  id: string
  name: string
  description: string | null
  type: string
  address: string | null
  phone: string | null
  images: string[] | null
  experiences: ExperienceRow[]
}

export default async function NegocioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('*, experiences(*)')
    .eq('id', id)
    .single()

  if (!business) notFound()

  const b = business as BusinessDetail
  const copyDetail = businessesCopy.detail
  const copyExp = businessesCopy.experiences
  const imageUrl = b.images?.[0]

  const activeExperiences = (b.experiences ?? []).filter(
    (e) => e.status === 'active'
  )

  return (
    <main className="min-h-screen bg-background pb-10">
      {/* Back link */}
      <div className="px-4 pt-4">
        <Link
          href="/negocios"
          className={cn(
            'inline-flex items-center gap-1.5',
            'text-sm font-medium text-primary',
            'min-h-[44px] py-2 hover:underline'
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copyDetail.back}
        </Link>
      </div>

      {/* Hero image */}
      <section className="relative mx-4 mt-2 h-56 md:h-72 rounded-2xl overflow-hidden">
        {imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
            role="img"
            aria-label={b.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Store
              className="size-16 text-primary/50"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 p-6 text-white">
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">{b.name}</h1>
          <span className="text-sm text-white/80">
            {businessesCopy.businesses.types[b.type] ??
              businessesCopy.businesses.types.other}
          </span>
        </div>
      </section>

      {/* Business info */}
      <section className="px-4 mt-6 space-y-4">
        {b.description && (
          <p className="text-base text-foreground leading-relaxed">{b.description}</p>
        )}

        <div className="space-y-2.5">
          {b.address && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin
                className="size-4 mt-0.5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-sm">{b.address}</span>
            </div>
          )}
          {b.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <a
                href={`tel:${b.phone}`}
                className="text-sm hover:text-primary transition-colors"
              >
                {b.phone}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Experiences */}
      <section className="px-4 mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          {copyExp.sectionTitle}
        </h2>

        {activeExperiences.length === 0 ? (
          <div className="rounded-2xl border border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">{copyExp.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeExperiences.map((exp) => (
              <ExperienceCard key={exp.id} experience={exp} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function ExperienceCard({ experience: exp }: { experience: ExperienceRow }) {
  const copy = businessesCopy.experiences
  const imageUrl = exp.images?.[0]

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-card border border-border">
      <div className="flex">
        {/* Thumbnail */}
        <div
          className={cn(
            'w-24 shrink-0 self-stretch bg-cover bg-center',
            !imageUrl && 'bg-gradient-to-br from-primary/20 to-accent/20'
          )}
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
          role={imageUrl ? 'img' : undefined}
          aria-label={imageUrl ? exp.name : undefined}
        >
          {!imageUrl && (
            <div className="h-full min-h-[96px] flex items-center justify-center">
              <Store
                className="size-6 text-primary/50"
                aria-hidden="true"
                strokeWidth={1.5}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 p-4 space-y-1.5">
          <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
            {exp.name}
          </h3>

          {exp.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {exp.description}
            </p>
          )}

          <p className="text-base font-semibold text-accent">
            ${exp.price.toLocaleString('es-CO')} COP
          </p>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            {exp.duration_minutes != null && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                {exp.duration_minutes}&nbsp;{copy.minutes}
              </span>
            )}
            {exp.capacity != null && (
              <span className="flex items-center gap-1">
                <Users className="size-3" aria-hidden="true" />
                {exp.capacity}&nbsp;{copy.people}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
