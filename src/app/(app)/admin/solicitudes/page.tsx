import Link from 'next/link'
import { Store, Car, Compass, User } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { approveRoleRequest } from '@/app/(app)/admin/actions'
import { cn } from '@/lib/utils'
import RejectForm from './RejectForm'
import AdminDocumentLink from '@/components/admin/AdminDocumentLink'

type RoleRequest = {
  id: string
  requested_role: string
  status: string
  notes: string | null
  metadata: Record<string, unknown>
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
  profiles: { full_name: string | null; email: string | null } | null
}

const VALID_STATUSES = ['pending', 'approved', 'rejected'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]

const ROLE_ICONS: Record<string, React.ElementType> = {
  business_owner: Store,
  transporter:    Car,
  tourist_guide:  Compass,
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}: </span>{value}
    </p>
  )
}

export default async function AdminSolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: rawStatus } = await searchParams
  const statusFilter: StatusFilter =
    VALID_STATUSES.includes(rawStatus as StatusFilter)
      ? (rawStatus as StatusFilter)
      : 'pending'

  const admin = createAdminClient()
  const copy = adminCopy.solicitudes

  const { data: requests } = await admin
    .from('role_requests')
    .select('id, requested_role, status, notes, metadata, rejection_reason, created_at, reviewed_at, profiles!user_id(full_name)')
    .eq('status', statusFilter)
    .order('created_at', { ascending: true })

  const items = (requests ?? []) as unknown as RoleRequest[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/solicitudes?status=${s}`}
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
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((req) => {
              const RoleIcon = ROLE_ICONS[req.requested_role] ?? User
              const roleLabel = copy.roles[req.requested_role as keyof typeof copy.roles] ?? req.requested_role
              const meta = req.metadata as Record<string, unknown>

              return (
                <div key={req.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <RoleIcon className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{req.profiles?.full_name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel} · {formatDate(req.created_at)}</p>
                    </div>
                  </div>

                  {/* Role-specific metadata */}
                  <div className="space-y-1 pl-12">
                    {req.requested_role === 'business_owner' && (
                      <>
                        {meta.business_name && <MetaRow label={copy.metaLabels.business_name} value={String(meta.business_name)} />}
                        {Array.isArray(meta.category_slugs) && (meta.category_slugs as string[]).length > 0 && (
                          <MetaRow label={copy.metaLabels.categories} value={(meta.category_slugs as string[]).join(', ')} />
                        )}
                        {meta.phone && <MetaRow label={copy.metaLabels.phone} value={String(meta.phone)} />}
                        {meta.rnt_number && <MetaRow label={copy.metaLabels.rnt_number} value={String(meta.rnt_number)} />}
                        {typeof meta.rnt_document_path === 'string' && (
                          <AdminDocumentLink label={copy.metaLabels.rnt_number} path={meta.rnt_document_path} />
                        )}
                      </>
                    )}
                    {req.requested_role === 'transporter' && (
                      <>
                        {meta.license_plate && <MetaRow label={copy.metaLabels.license_plate} value={String(meta.license_plate)} />}
                        {meta.vehicle_type && <MetaRow label={copy.metaLabels.vehicle_type} value={String(meta.vehicle_type)} />}
                        {meta.phone && <MetaRow label={copy.metaLabels.phone} value={String(meta.phone)} />}
                        {typeof meta.transport_tier === 'string' && (
                          <MetaRow
                            label={copy.metaLabels.transport_tier}
                            value={copy.transportTierLabels[meta.transport_tier] ?? meta.transport_tier}
                          />
                        )}
                        {meta.transport_tier === 'cooperative' ? (
                          <>
                            {meta.cooperative_name && <MetaRow label={copy.metaLabels.cooperative_name} value={String(meta.cooperative_name)} />}
                            {meta.cooperative_rnt_number && <MetaRow label={copy.metaLabels.cooperative_rnt_number} value={String(meta.cooperative_rnt_number)} />}
                            {meta.cooperative_habilitacion_number && (
                              <MetaRow label={copy.metaLabels.cooperative_habilitacion_number} value={String(meta.cooperative_habilitacion_number)} />
                            )}
                            {typeof meta.cooperative_document_path === 'string' && (
                              <AdminDocumentLink label={copy.metaLabels.cooperative_name} path={meta.cooperative_document_path} />
                            )}
                          </>
                        ) : meta.transport_tier === 'independent' ? (
                          <>
                            {meta.driver_license_number && <MetaRow label={copy.metaLabels.driver_license_number} value={String(meta.driver_license_number)} />}
                            {meta.driver_license_expiry && <MetaRow label={copy.metaLabels.driver_license_expiry} value={String(meta.driver_license_expiry)} />}
                            {typeof meta.driver_license_document_path === 'string' && (
                              <AdminDocumentLink label={copy.metaLabels.driver_license_number} path={meta.driver_license_document_path} />
                            )}
                            {meta.soat_expiry_date && <MetaRow label={copy.metaLabels.soat_expiry_date} value={String(meta.soat_expiry_date)} />}
                            {typeof meta.soat_document_path === 'string' && (
                              <AdminDocumentLink label={copy.metaLabels.soat_expiry_date} path={meta.soat_document_path} />
                            )}
                          </>
                        ) : null}
                      </>
                    )}
                    {req.requested_role === 'tourist_guide' && (
                      <>
                        {Array.isArray(meta.specialties) && (
                          <MetaRow
                            label={copy.metaLabels.specialties}
                            value={(meta.specialties as string[])
                              .map((s) => roleRequestsCopy.form.touristGuide.specialtyOptions[s as keyof typeof roleRequestsCopy.form.touristGuide.specialtyOptions] ?? s)
                              .join(', ')}
                          />
                        )}
                        {Array.isArray(meta.languages) && (
                          <MetaRow
                            label={copy.metaLabels.languages}
                            value={(meta.languages as string[])
                              .map((l) => roleRequestsCopy.form.touristGuide.languageOptions[l as keyof typeof roleRequestsCopy.form.touristGuide.languageOptions] ?? l)
                              .join(', ')}
                          />
                        )}
                        {meta.phone && <MetaRow label={copy.metaLabels.phone} value={String(meta.phone)} />}
                        {meta.experience_years != null && <MetaRow label={copy.metaLabels.experience_years} value={`${meta.experience_years} años`} />}
                        {meta.bio && <MetaRow label={copy.metaLabels.bio} value={String(meta.bio)} />}
                        {meta.rnt_number && <MetaRow label={copy.metaLabels.rnt_number} value={String(meta.rnt_number)} />}
                        {typeof meta.rnt_document_path === 'string' && (
                          <AdminDocumentLink label={copy.metaLabels.rnt_number} path={meta.rnt_document_path} />
                        )}
                        {meta.tarjeta_profesional_number && (
                          <MetaRow label={copy.metaLabels.tarjeta_profesional_number} value={String(meta.tarjeta_profesional_number)} />
                        )}
                        {typeof meta.tarjeta_profesional_document_path === 'string' && (
                          <AdminDocumentLink label={copy.metaLabels.tarjeta_profesional_number} path={meta.tarjeta_profesional_document_path} />
                        )}
                      </>
                    )}
                    {req.notes && (
                      <p className="text-xs text-muted-foreground italic">"{req.notes}"</p>
                    )}
                    {statusFilter === 'rejected' && req.rejection_reason && (
                      <p className="text-xs text-destructive">
                        <span className="font-medium">{copy.rejectedBecause} </span>{req.rejection_reason}
                      </p>
                    )}
                  </div>

                  {/* Actions — pending only */}
                  {statusFilter === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <form action={approveRoleRequest} className="flex-1">
                        <input type="hidden" name="requestId" value={req.id} />
                        <button
                          type="submit"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-semibold min-h-[34px] hover:bg-primary/90 transition-colors"
                        >
                          {copy.approve}
                        </button>
                      </form>
                      <div className="flex-1">
                        <RejectForm requestId={req.id} />
                      </div>
                    </div>
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
