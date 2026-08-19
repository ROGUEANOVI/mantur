import { Tag } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { cn } from '@/lib/utils'
import { toggleServiceTypeActive } from './actions'
import CreateServiceTypeForm from './CreateServiceTypeForm'

type ServiceTypeRow = {
  id: string
  name: string
  slug: string
  pricing_unit: 'per_person' | 'per_night' | 'fixed'
  is_active: boolean
  sort_order: number
}

export default async function TiposServicioPage() {
  const admin = createAdminClient()
  const copy = adminCopy.tiposServicio

  const { data } = await admin
    .from('service_types')
    .select('id, name, slug, pricing_unit, is_active, sort_order')
    .order('sort_order', { ascending: true })

  const types = (data ?? []) as ServiceTypeRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {/* Create form */}
        <CreateServiceTypeForm />

        {/* Type list */}
        {types.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {types.map((type) => (
              <div
                key={type.id}
                className={cn(
                  'rounded-2xl border bg-card shadow-sm px-4 py-3 flex items-center gap-3',
                  type.is_active ? 'border-border' : 'border-border/50 opacity-60',
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Tag className="size-4 text-primary" aria-hidden="true" strokeWidth={1.5} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">
                    {type.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {type.slug} · {copy.pricingUnit[type.pricing_unit]}
                  </p>
                </div>

                <form action={toggleServiceTypeActive}>
                  <input type="hidden" name="id" value={type.id} />
                  <input type="hidden" name="is_active" value={String(type.is_active)} />
                  <button
                    type="submit"
                    className={cn(
                      'rounded-lg px-3 text-xs font-medium min-h-[36px] border transition-colors',
                      type.is_active
                        ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                        : 'border-primary/30 text-primary hover:bg-primary/10',
                    )}
                  >
                    {type.is_active ? copy.deactivate : copy.activate}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
