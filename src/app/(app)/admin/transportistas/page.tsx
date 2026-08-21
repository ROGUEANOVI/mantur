import Link from 'next/link'
import { Car } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { transportCopy } from '@/lib/copy/transport'
import { deactivateTransporter, activateTransporter, deleteTransporter } from './actions'
import Avatar from '@/components/shared/Avatar'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import AdminDocumentLink from '@/components/admin/AdminDocumentLink'
import { cn } from '@/lib/utils'

const VALID_STATUSES = ['active', 'inactive'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]

type TransporterRow = {
  id: string
  vehicle_type: string
  license_plate: string
  phone: string
  is_available: boolean
  transport_tier: string
  cooperative_name: string | null
  cooperative_document_path: string | null
  driver_license_document_path: string | null
  driver_license_expiry: string | null
  soat_document_path: string | null
  soat_expiry_date: string | null
  verification_status: string
  profiles: { id: string; full_name: string | null; avatar_url: string | null; role: string } | null
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

export default async function AdminTransportistasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>
}) {
  const { status: rawStatus, error: rawError } = await searchParams
  const statusFilter: StatusFilter =
    VALID_STATUSES.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : 'active'

  const admin = createAdminClient()
  const copy = adminCopy.transportistas

  let query = admin
    .from('transporters')
    .select('id, vehicle_type, license_plate, phone, is_available, transport_tier, cooperative_name, cooperative_document_path, driver_license_document_path, driver_license_expiry, soat_document_path, soat_expiry_date, verification_status, profiles!inner(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: true })

  query = query.filter('profiles.role', statusFilter === 'active' ? 'eq' : 'neq', 'transporter')

  const { data } = await query
  const items = (data ?? []) as unknown as TransporterRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {rawError === 'has_requests' && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {copy.errors.deleteBlocked}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/transportistas?status=${s}`}
              className={cn(
                'flex-1 text-center text-sm font-medium py-1.5 rounded-lg transition-colors',
                statusFilter === s
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {copy.filter[s]}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <Car className="size-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((t) => {
              const name = t.profiles?.full_name ?? 'Transportista'
              const profileId = t.profiles?.id ?? ''
              const vehicleLabel = transportCopy.publicPage.vehicleTypes[t.vehicle_type] ?? t.vehicle_type

              return (
                <div key={t.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={name} avatarUrl={t.profiles?.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{name}</p>
                        <p className="text-xs text-muted-foreground">{t.phone}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          copy.statusColors[statusFilter],
                        )}
                      >
                        {copy.statusLabels[statusFilter]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.is_available ? copy.available : copy.notAvailable}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {vehicleLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground font-mono">
                      {t.license_plate}
                    </span>
                  </div>

                  {/* Verification */}
                  <div className="space-y-1.5 rounded-xl bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                          adminCopy.transportistas.verification.statusColors[t.verification_status] ?? adminCopy.transportistas.verification.statusColors.pending_review,
                        )}
                      >
                        {adminCopy.transportistas.verification.statusLabels[t.verification_status] ?? t.verification_status}
                      </span>
                      {t.transport_tier === 'cooperative' && t.cooperative_name && (
                        <span className="text-xs text-muted-foreground">
                          {adminCopy.transportistas.verification.cooperativeLabel}: {t.cooperative_name}
                        </span>
                      )}
                      {isExpired(t.driver_license_expiry) && (
                        <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                          {adminCopy.transportistas.verification.driverLicenseLabel} {adminCopy.transportistas.verification.expired}
                        </span>
                      )}
                      {isExpired(t.soat_expiry_date) && (
                        <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                          {adminCopy.transportistas.verification.soatLabel} {adminCopy.transportistas.verification.expired}
                        </span>
                      )}
                    </div>
                    {t.cooperative_document_path || t.driver_license_document_path || t.soat_document_path ? (
                      <>
                        {t.cooperative_document_path && (
                          <AdminDocumentLink label={adminCopy.transportistas.verification.cooperativeLabel} path={t.cooperative_document_path} />
                        )}
                        {t.driver_license_document_path && (
                          <AdminDocumentLink label={adminCopy.transportistas.verification.driverLicenseLabel} path={t.driver_license_document_path} />
                        )}
                        {t.soat_document_path && (
                          <AdminDocumentLink label={adminCopy.transportistas.verification.soatLabel} path={t.soat_document_path} />
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">{adminCopy.transportistas.verification.noDocuments}</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    {statusFilter === 'active' ? (
                      <form id={`deactivate-transporter-${t.id}`} action={deactivateTransporter}>
                        <input type="hidden" name="transporterId" value={t.id} />
                        <input type="hidden" name="profileId" value={profileId} />
                      </form>
                    ) : (
                      <form action={activateTransporter} className="flex-1">
                        <input type="hidden" name="profileId" value={profileId} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-medium min-h-[36px] hover:bg-primary/90 transition-colors"
                        >
                          {copy.activate}
                        </button>
                      </form>
                    )}

                    {statusFilter === 'active' && (
                      <ConfirmDeleteButton
                        formId={`deactivate-transporter-${t.id}`}
                        title={`${copy.confirmDeactivateTitle}: ${name}`}
                        description={copy.confirmDeactivateDescription}
                        confirmLabel={copy.confirmDeactivateConfirm}
                        cancelLabel={copy.confirmCancel}
                        trigger={copy.deactivate}
                        triggerAriaLabel={`${copy.deactivate} ${name}`}
                        triggerClassName="flex-1 inline-flex items-center justify-center rounded-xl border border-destructive/40 bg-destructive/5 text-destructive text-xs font-medium min-h-[36px] hover:bg-destructive/10 transition-colors"
                      />
                    )}

                    <form id={`delete-transporter-${t.id}`} action={deleteTransporter}>
                      <input type="hidden" name="transporterId" value={t.id} />
                      <input type="hidden" name="profileId" value={profileId} />
                    </form>
                    <ConfirmDeleteButton
                      formId={`delete-transporter-${t.id}`}
                      title={`${copy.confirmDeleteTitle}: ${name}`}
                      description={copy.confirmDeleteDescription}
                      confirmLabel={copy.confirmDeleteConfirm}
                      cancelLabel={copy.confirmCancel}
                      trigger={copy.delete}
                      triggerAriaLabel={`${copy.delete} ${name}`}
                      triggerClassName="inline-flex items-center rounded-lg border border-destructive/40 text-xs font-medium text-destructive px-2.5 min-h-[36px] hover:bg-destructive/10 transition-colors shrink-0"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
