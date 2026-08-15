import Link from 'next/link'
import { TreePine, Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { businessesCopy } from '@/lib/copy/businesses'
import { deletePlace } from '@/app/(app)/admin/actions'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import { cn } from '@/lib/utils'

type PlaceRow = {
  id: string
  name: string
  description: string | null
  type: string
  lat: number | null
  lng: number | null
}

export default async function AdminLugaresPage() {
  const admin = createAdminClient()

  const { data: places } = await admin
    .from('places')
    .select('id, name, description, type, lat, lng')
    .order('name')

  const items = (places ?? []) as PlaceRow[]
  const copy = adminCopy.lugares

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Link
            href="/admin/lugares/nuevo"
            className="inline-flex items-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-4 hover:bg-primary/90 transition-colors shrink-0"
          >
            {copy.new}
          </Link>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <TreePine
              className="size-10 text-muted-foreground/40 mx-auto mb-3"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((place) => {
              const typeLabel =
                businessesCopy.places.types[place.type] ??
                businessesCopy.places.types.other

              return (
                <div
                  key={place.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <TreePine
                          className="size-5 text-primary"
                          aria-hidden="true"
                          strokeWidth={1.5}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">
                          {place.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{typeLabel}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/admin/lugares/${place.id}/editar`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg border border-border',
                          'text-xs font-medium text-foreground px-2.5 min-h-[36px]',
                          'hover:bg-muted transition-colors',
                        )}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        {copy.edit}
                      </Link>
                      <form id={`delete-place-${place.id}`} action={deletePlace}>
                        <input type="hidden" name="placeId" value={place.id} />
                      </form>
                      <ConfirmDeleteButton
                        formId={`delete-place-${place.id}`}
                        title={`${copy.confirmDeleteTitle}: ${place.name}`}
                        description={copy.confirmDeleteDescription}
                        confirmLabel={copy.confirmDeleteConfirm}
                        cancelLabel={copy.confirmDeleteCancel}
                        trigger={copy.delete}
                        triggerAriaLabel={`${copy.delete} ${place.name}`}
                        triggerClassName={cn(
                          'inline-flex items-center rounded-lg border border-destructive/40',
                          'text-xs font-medium text-destructive px-2.5 min-h-[36px]',
                          'hover:bg-destructive/10 transition-colors',
                        )}
                      />
                    </div>
                  </div>

                  {place.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 ml-[52px]">
                      {place.description}
                    </p>
                  )}

                  {(place.lat != null || place.lng != null) && (
                    <p className="text-xs text-muted-foreground mt-1 ml-[52px] font-mono">
                      {place.lat}, {place.lng}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
