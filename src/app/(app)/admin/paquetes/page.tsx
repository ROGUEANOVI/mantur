import Link from 'next/link'
import { Package, Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { cn } from '@/lib/utils'
import { togglePackageActive } from './actions'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import DeletePackageForm from '@/components/admin/DeletePackageForm'

type PackageRow = {
  id: string
  name: string
  base_price: number
  pricing_unit: string
  is_active: boolean
}

function formatCOP(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default async function AdminPaquetesPage() {
  const admin = createAdminClient()
  const copy = adminCopy.paquetes

  const { data } = await admin
    .from('packages')
    .select('id, name, base_price, pricing_unit, is_active')
    .order('name')

  const packages = (data ?? []) as PackageRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Link
            href="/admin/paquetes/nuevo"
            className="inline-flex items-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold min-h-11 px-4 hover:bg-primary/90 transition-colors shrink-0"
          >
            {copy.new}
          </Link>
        </div>

        {packages.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <Package className="size-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className={cn(
                  'rounded-2xl border bg-card shadow-sm p-4',
                  pkg.is_active ? 'border-border' : 'border-border/50 opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Package className="size-5 text-primary" aria-hidden="true" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCOP(pkg.base_price)}</p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      pkg.is_active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {pkg.is_active ? copy.statusLabels.active : copy.statusLabels.inactive}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <Link
                    href={`/admin/paquetes/${pkg.id}/editar`}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-lg border border-border',
                      'text-xs font-medium text-foreground px-2.5 min-h-[36px]',
                      'hover:bg-muted transition-colors',
                    )}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    {copy.edit}
                  </Link>

                  <form action={togglePackageActive}>
                    <input type="hidden" name="id" value={pkg.id} />
                    <input type="hidden" name="is_active" value={String(pkg.is_active)} />
                    <button
                      type="submit"
                      className={cn(
                        'rounded-lg px-2.5 text-xs font-medium min-h-[36px] border transition-colors',
                        pkg.is_active
                          ? 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                          : 'border-primary/30 text-primary hover:bg-primary/10',
                      )}
                    >
                      {pkg.is_active ? copy.deactivate : copy.activate}
                    </button>
                  </form>

                  <DeletePackageForm formId={`delete-package-${pkg.id}`} packageId={pkg.id} />
                  <ConfirmDeleteButton
                    formId={`delete-package-${pkg.id}`}
                    title={`${copy.confirmDeleteTitle}: ${pkg.name}`}
                    description={copy.confirmDeleteDescription}
                    confirmLabel={copy.confirmDeleteConfirm}
                    cancelLabel={copy.confirmDeleteCancel}
                    trigger={copy.delete}
                    triggerAriaLabel={`${copy.delete} ${pkg.name}`}
                    triggerClassName={cn(
                      'inline-flex items-center rounded-lg border border-destructive/40',
                      'text-xs font-medium text-destructive px-2.5 min-h-[36px]',
                      'hover:bg-destructive/10 transition-colors',
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
