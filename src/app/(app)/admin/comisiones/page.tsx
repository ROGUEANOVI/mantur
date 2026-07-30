import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import CommissionForm from '@/components/admin/CommissionForm'

type CommissionRow = {
  id: string
  service_type: string
  rate: number
}

export default async function AdminComisionesPage() {
  const admin = createAdminClient()

  const { data: commissions } = await admin
    .from('commission_config')
    .select('id, service_type, rate')
    .order('service_type', { ascending: true })

  const rows = (commissions ?? []) as CommissionRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {adminCopy.comisiones.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {adminCopy.comisiones.subtitle}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-6">
          {rows.map((row) => (
            <CommissionForm
              key={row.id}
              configId={row.id}
              serviceType={row.service_type}
              currentRate={Number(row.rate)}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
