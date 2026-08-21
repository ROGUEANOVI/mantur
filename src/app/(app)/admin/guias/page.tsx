import Link from 'next/link'
import { Compass } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { deactivateGuide, activateGuide, deleteGuide } from './actions'
import Avatar from '@/components/shared/Avatar'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import AdminDocumentLink from '@/components/admin/AdminDocumentLink'
import { cn } from '@/lib/utils'

const VALID_STATUSES = ['active', 'inactive'] as const
type StatusFilter = (typeof VALID_STATUSES)[number]

type GuideRow = {
  id: string
  phone: string
  specialties: string[]
  languages: string[]
  is_available: boolean
  rnt_number: string | null
  rnt_expiry_date: string | null
  rnt_document_path: string | null
  tarjeta_profesional_number: string | null
  tarjeta_profesional_document_path: string | null
  verification_status: string
  profiles: { id: string; full_name: string | null; avatar_url: string | null; role: string } | null
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date(new Date().toDateString())
}

export default async function AdminGuiasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>
}) {
  const { status: rawStatus, error: rawError } = await searchParams
  const statusFilter: StatusFilter =
    VALID_STATUSES.includes(rawStatus as StatusFilter) ? (rawStatus as StatusFilter) : 'active'

  const admin = createAdminClient()
  const copy = adminCopy.guias

  let query = admin
    .from('tourist_guides')
    .select('id, phone, specialties, languages, is_available, rnt_number, rnt_expiry_date, rnt_document_path, tarjeta_profesional_number, tarjeta_profesional_document_path, verification_status, profiles!inner(id, full_name, avatar_url, role)')
    .order('created_at', { ascending: true })

  query = query.filter('profiles.role', statusFilter === 'active' ? 'eq' : 'neq', 'tourist_guide')

  const { data } = await query
  const items = (data ?? []) as unknown as GuideRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {rawError === 'has_bookings' && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {copy.errors.deleteBlocked}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted">
          {VALID_STATUSES.map((s) => (
            <Link
              key={s}
              href={`/admin/guias?status=${s}`}
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
            <Compass className="size-10 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((guide) => {
              const name = guide.profiles?.full_name ?? 'Guía'
              const profileId = guide.profiles?.id ?? ''

              return (
                <div key={guide.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={name} avatarUrl={guide.profiles?.avatar_url} size="sm" />
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-snug line-clamp-1">{name}</p>
                        <p className="text-xs text-muted-foreground">{guide.phone}</p>
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
                        {guide.is_available ? copy.available : copy.notAvailable}
                      </span>
                    </div>
                  </div>

                  {(guide.specialties.length > 0 || guide.languages.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {guide.specialties.map((s) => (
                        <span
                          key={`sp-${s}`}
                          className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                        >
                          {roleRequestsCopy.form.touristGuide.specialtyOptions[s as keyof typeof roleRequestsCopy.form.touristGuide.specialtyOptions] ?? s}
                        </span>
                      ))}
                      {guide.languages.map((l) => (
                        <span
                          key={`lang-${l}`}
                          className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {roleRequestsCopy.form.touristGuide.languageOptions[l as keyof typeof roleRequestsCopy.form.touristGuide.languageOptions] ?? l}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Verification */}
                  <div className="space-y-1.5 rounded-xl bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                          adminCopy.guias.verification.statusColors[guide.verification_status] ?? adminCopy.guias.verification.statusColors.pending_review,
                        )}
                      >
                        {adminCopy.guias.verification.statusLabels[guide.verification_status] ?? guide.verification_status}
                      </span>
                      {isExpired(guide.rnt_expiry_date) && (
                        <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                          {adminCopy.guias.verification.rntLabel} {adminCopy.guias.verification.expired}
                        </span>
                      )}
                    </div>
                    {guide.rnt_document_path || guide.tarjeta_profesional_document_path ? (
                      <>
                        {guide.rnt_document_path && (
                          <AdminDocumentLink
                            label={`${adminCopy.guias.verification.rntLabel}${guide.rnt_number ? ` ${guide.rnt_number}` : ''}`}
                            path={guide.rnt_document_path}
                          />
                        )}
                        {guide.tarjeta_profesional_document_path && (
                          <AdminDocumentLink
                            label={`${adminCopy.guias.verification.tarjetaLabel}${guide.tarjeta_profesional_number ? ` ${guide.tarjeta_profesional_number}` : ''}`}
                            path={guide.tarjeta_profesional_document_path}
                          />
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">{adminCopy.guias.verification.noDocuments}</p>
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    {statusFilter === 'active' ? (
                      <form id={`deactivate-guide-${guide.id}`} action={deactivateGuide}>
                        <input type="hidden" name="guideId" value={guide.id} />
                        <input type="hidden" name="profileId" value={profileId} />
                      </form>
                    ) : (
                      <form action={activateGuide} className="flex-1">
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
                        formId={`deactivate-guide-${guide.id}`}
                        title={`${copy.confirmDeactivateTitle}: ${name}`}
                        description={copy.confirmDeactivateDescription}
                        confirmLabel={copy.confirmDeactivateConfirm}
                        cancelLabel={copy.confirmCancel}
                        trigger={copy.deactivate}
                        triggerAriaLabel={`${copy.deactivate} ${name}`}
                        triggerClassName="flex-1 inline-flex items-center justify-center rounded-xl border border-destructive/40 bg-destructive/5 text-destructive text-xs font-medium min-h-[36px] hover:bg-destructive/10 transition-colors"
                      />
                    )}

                    <form id={`delete-guide-${guide.id}`} action={deleteGuide}>
                      <input type="hidden" name="guideId" value={guide.id} />
                      <input type="hidden" name="profileId" value={profileId} />
                    </form>
                    <ConfirmDeleteButton
                      formId={`delete-guide-${guide.id}`}
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
