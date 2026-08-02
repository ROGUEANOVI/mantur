import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Phone, Store, ChevronLeft, Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import BusinessImageCarousel from '@/components/shared/BusinessImageCarousel'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  if (!UUID_RE.test(id)) return {}

  const { data } = await createAdminClient()
    .from('businesses')
    .select('name, description, images')
    .eq('id', id)
    .eq('verified', true)
    .eq('status', 'active')
    .single()

  if (!data) return {}

  const title = data.name
  const description =
    data.description ??
    `Reserva experiencias en ${data.name} en Manaure Balcón del Cesar.`
  const image = (data.images as string[] | null)?.[0]

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://mantur.co/negocios/${id}`,
      images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

type ExperienceRow = {
  id: string
  name: string
  description: string | null
  price: string | number
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

  const { data: { user } } = await supabase.auth.getUser()
  const isGuest = !user
  let isTourist = false
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isTourist = profile?.role === 'tourist'
  }

  const { data: business, error } = await supabase
    .from('businesses')
    .select(
      'id, name, description, type, address, phone, images, experiences(id, name, description, price, capacity, duration_minutes, images, status)'
    )
    .eq('id', id)
    .eq('verified', true)
    .eq('status', 'active')
    .single()

  if (error) {
    if (error.code === 'PGRST116') notFound()
    throw new Error(error.message)
  }

  const b = business as BusinessDetail
  const copyDetail = businessesCopy.detail
  const copyExp = businessesCopy.experiences

  const activeExperiences = (b.experiences ?? []).filter((e) => e.status === 'active')

  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="max-w-2xl mx-auto">
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

        {/* Image carousel */}
        <BusinessImageCarousel images={b.images ?? []} name={b.name} />

        {/* Business name + type */}
        <section className="px-4 mt-4">
          <p className="text-xs font-medium text-accent uppercase tracking-wide mb-0.5">
            {businessesCopy.businesses.types[b.type] ?? businessesCopy.businesses.types.other}
          </p>
          <h1 className="text-2xl font-bold text-foreground leading-tight">{b.name}</h1>
        </section>

        {/* Business info */}
        <section className="px-4 mt-4 space-y-3">
          {b.description && (
            <p className="text-sm text-foreground/80 leading-relaxed">{b.description}</p>
          )}
          <div className="space-y-2">
            {b.address && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="size-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm">{b.address}</span>
              </div>
            )}
            {b.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <a href={`tel:${b.phone}`} className="text-sm hover:text-primary transition-colors">
                  {b.phone}
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Experiences */}
        <section className="px-4 mt-8">
          <h2 className="text-base font-semibold text-foreground mb-3">{copyExp.sectionTitle}</h2>
          {activeExperiences.length === 0 ? (
            <div className="rounded-2xl border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">{copyExp.empty}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeExperiences.map((exp) => (
                <ExperienceCard key={exp.id} experience={exp} isTourist={isTourist} isGuest={isGuest} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function ExperienceCard({
  experience: exp,
  isTourist,
  isGuest,
}: {
  experience: ExperienceRow
  isTourist: boolean
  isGuest: boolean
}) {
  const copy = businessesCopy.experiences
  const imageUrl = exp.images?.[0]

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-card border border-border flex">
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
            <Store className="size-6 text-primary/50" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>

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
          ${Number(exp.price).toLocaleString('es-CO')} COP
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

        {isTourist ? (
          <Link
            href={`/reservas/nueva?exp=${exp.id}`}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-[44px] hover:bg-primary/90 transition-colors"
          >
            {copy.book}
          </Link>
        ) : isGuest ? (
          <Link
            href="/login"
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-primary text-primary text-sm font-semibold min-h-[44px] hover:bg-primary/10 transition-colors"
          >
            {copy.bookGuest}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
