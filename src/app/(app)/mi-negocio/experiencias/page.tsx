import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Clock, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy, businessesCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ToggleExperienceButton } from '@/components/mi-negocio/ToggleExperienceButton'

type Experience = {
  id: string
  name: string
  description: string | null
  price: string | number
  capacity: number | null
  duration_minutes: number | null
  status: string
}

export default async function ExperienciasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Resolve the business that belongs to this owner
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user!.id)
    .single()

  // Owner hasn't created a business yet
  if (!business) redirect('/mi-negocio')

  const { data: experiences } = await supabase
    .from('experiences')
    .select('id, name, description, price, capacity, duration_minutes, status')
    .eq('business_id', business.id)
    .order('created_at', { ascending: false })

  const copy = miNegocioCopy.experiences
  const list = (experiences ?? []) as Experience[]

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        {/* Section header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <Link
            href="/mi-negocio/experiencias/nueva"
            className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-primary text-primary-foreground text-sm font-medium px-3 min-h-[44px] hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            {copy.addButton}
          </Link>
        </div>

        {/* Empty state */}
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
            <Link
              href="/mi-negocio/experiencias/nueva"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium px-4 min-h-[44px] hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-4" aria-hidden="true" />
              {copy.addButton}
            </Link>
          </div>
        ) : (
          <ul className="space-y-3" role="list">
            {list.map((exp) => (
              <li key={exp.id}>
                <ExperienceCard experience={exp} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function ExperienceCard({ experience: exp }: { experience: Experience }) {
  const copy = miNegocioCopy.experiences
  const expCopy = businessesCopy.experiences
  const isActive = exp.status === 'active'

  const badgeClass = isActive
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

  const badgeLabel = isActive ? copy.statusActive : copy.statusInactive

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow p-4 space-y-3">
      {/* Name + status badge */}
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-foreground leading-snug line-clamp-1 text-base">
          {exp.name}
        </h2>
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
            badgeClass,
          )}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Description */}
      {exp.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {exp.description}
        </p>
      )}

      {/* Price + meta */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-base font-semibold text-accent">
          ${Number(exp.price).toLocaleString('es-CO')} COP
        </p>

        {exp.duration_minutes != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {exp.duration_minutes}&nbsp;{expCopy.minutes}
          </span>
        )}

        {exp.capacity != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden="true" />
            {exp.capacity}&nbsp;{expCopy.people}
          </span>
        )}
      </div>

      {/* Toggle action */}
      <div className="pt-1">
        <ToggleExperienceButton
          experienceId={exp.id}
          currentStatus={exp.status as 'active' | 'inactive'}
        />
      </div>
    </div>
  )
}
