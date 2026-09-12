import { Tag } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { cn } from '@/lib/utils'
import { toggleCategoryActive, toggleCategoryListingMode } from './actions'
import CreateCategoryForm from './CreateCategoryForm'
import type { BusinessListingMode } from '@/lib/businesses/listingMode'

type CategoryRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
  sort_order: number
  default_listing_mode: BusinessListingMode
}

export default async function CategoriasPage() {
  const admin = createAdminClient()
  const copy = adminCopy.categorias

  const { data } = await admin
    .from('business_categories')
    .select('id, name, slug, is_active, sort_order, default_listing_mode')
    .order('sort_order', { ascending: true })

  const categories = (data ?? []) as CategoryRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {/* Create form */}
        <CreateCategoryForm />

        {/* Category list */}
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={cn(
                  'rounded-2xl border bg-card shadow-sm px-4 py-3 space-y-2.5',
                  cat.is_active ? 'border-border' : 'border-border/50 opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Tag className="size-4 text-primary" aria-hidden="true" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {cat.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{cat.slug}</p>
                  </div>

                  <form action={toggleCategoryActive}>
                    <input type="hidden" name="id" value={cat.id} />
                    <input type="hidden" name="is_active" value={String(cat.is_active)} />
                    <button
                      type="submit"
                      className={cn(
                        'rounded-lg px-3 text-xs font-medium min-h-[36px] border transition-colors',
                        cat.is_active
                          ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                          : 'border-primary/30 text-primary hover:bg-primary/10',
                      )}
                    >
                      {cat.is_active ? copy.deactivate : copy.activate}
                    </button>
                  </form>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/30 px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                      cat.default_listing_mode === 'informational'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary/15 text-primary',
                    )}
                  >
                    {cat.default_listing_mode === 'informational' ? copy.modeInformational : copy.modeBookable}
                  </span>
                  <form action={toggleCategoryListingMode}>
                    <input type="hidden" name="id" value={cat.id} />
                    <input type="hidden" name="default_listing_mode" value={cat.default_listing_mode} />
                    <button
                      type="submit"
                      className="rounded-lg px-2.5 text-xs font-medium min-h-[32px] border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {cat.default_listing_mode === 'bookable' ? copy.setToInformational : copy.setToBookable}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
