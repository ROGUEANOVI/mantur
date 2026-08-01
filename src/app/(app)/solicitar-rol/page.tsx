import { redirect } from 'next/navigation'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import ManturLogo from '@/components/shared/ManturLogo'
import RoleRequestForm from './RoleRequestForm'

type RoleRequest = {
  id: string
  requested_role: string
  status: string
  rejection_reason: string | null
  created_at: string
}

export const metadata = { title: 'Únete a ManTur' }

export default async function SolicitarRolPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileResult, requestsResult, categoriesResult] = await Promise.all([
    supabase.from('profiles').select('role, full_name').eq('id', user.id).single(),
    supabase
      .from('role_requests')
      .select('id, requested_role, status, rejection_reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    createAdminClient()
      .from('business_categories')
      .select('slug, name')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  const role      = profileResult.data?.role ?? 'tourist'
  const firstName = (profileResult.data?.full_name ?? '').split(' ')[0] || null
  const requests  = (requestsResult.data ?? []) as RoleRequest[]
  const categories = categoriesResult.data ?? []
  const copy = roleRequestsCopy

  const pendingRequest = requests.find((r) => r.status === 'pending')
  const lastRejected   = !pendingRequest ? requests.find((r) => r.status === 'rejected') : null
  const hasApproved    = role !== 'tourist'

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a2b1e] via-[#0e7a54] to-[#0d3d28] text-white">

        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/5" />

        {/* Decorative path/compass SVG */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-6 bottom-4 w-28 opacity-10"
          viewBox="0 0 100 100"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        >
          <circle cx="50" cy="50" r="40" />
          <circle cx="50" cy="50" r="28" />
          <line x1="50" y1="10" x2="50" y2="20" />
          <line x1="50" y1="80" x2="50" y2="90" />
          <line x1="10" y1="50" x2="20" y2="50" />
          <line x1="80" y1="50" x2="90" y2="50" />
          <polygon points="50,26 54,44 50,48 46,44" fill="white" stroke="none" opacity="0.6" />
          <polygon points="50,72 46,54 50,50 54,54" fill="white" stroke="none" opacity="0.3" />
        </svg>

        <div className="relative mx-auto max-w-lg px-4 py-10 text-center space-y-4">
          <div className="flex justify-center">
            <ManturLogo size="lg" />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold tracking-widest uppercase text-white/60">
              Turismo con alma local
            </p>
            <h1 className="text-2xl font-bold leading-tight">
              {firstName ? `${firstName}, haz parte de ManTur` : 'Haz parte de ManTur'}
            </h1>
            <p className="text-sm text-white/75 max-w-sm mx-auto leading-relaxed">
              {copy.page.subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className="flex-1 px-4 py-8 pb-16">
        <div className="mx-auto max-w-lg space-y-4">

          {/* Already has a role */}
          {hasApproved && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center space-y-2">
              <CheckCircle2 className="size-9 text-primary mx-auto" strokeWidth={1.5} />
              <p className="font-semibold text-foreground">{copy.status.approved.title}</p>
              <p className="text-sm text-muted-foreground">
                {copy.alreadyHasRole}
                {' '}
                <span className="font-medium text-foreground">
                  {copy.roles[role as keyof typeof copy.roles] ?? role}
                </span>
              </p>
            </div>
          )}

          {/* Pending banner */}
          {!hasApproved && pendingRequest && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-5 flex gap-3">
              <Clock className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {copy.status.pending.title}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {copy.roles[pendingRequest.requested_role as keyof typeof copy.roles]}
                  {' · '}
                  {copy.status.pending.description}
                </p>
              </div>
            </div>
          )}

          {/* Rejection feedback */}
          {!hasApproved && lastRejected && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex gap-3">
                <XCircle className="size-5 text-destructive shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{copy.status.rejected.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {copy.roles[lastRejected.requested_role as keyof typeof copy.roles]}
                  </p>
                </div>
              </div>
              {lastRejected.rejection_reason && (
                <p className="text-sm text-foreground ml-8">
                  <span className="text-muted-foreground">{copy.status.rejected.descriptionPrefix} </span>
                  {lastRejected.rejection_reason}
                </p>
              )}
            </div>
          )}

          {/* Role selection / form */}
          {!hasApproved && !pendingRequest && (
            <RoleRequestForm categories={categories} />
          )}

        </div>
      </section>
    </div>
  )
}
