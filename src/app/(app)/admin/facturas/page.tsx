import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import CheckDianStatusButton from '@/components/admin/CheckDianStatusButton'

type PendingInvoiceRow = {
  id: string
  alegra_invoice_id: string
  created_at: string
  bookings: {
    booking_date: string
    services: { name: string } | null
    guide_tours: { name: string } | null
  } | null
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AdminFacturasPage() {
  const admin = createAdminClient()
  const copy = adminCopy.facturas

  const { data: transactions } = await admin
    .from('transactions')
    .select('id, alegra_invoice_id, created_at, bookings!booking_id(booking_date, services(name), guide_tours(name))')
    .eq('alegra_invoice_status', 'pending')
    .not('alegra_invoice_id', 'is', null)
    .order('created_at', { ascending: true })

  const items = (transactions ?? []) as unknown as PendingInvoiceRow[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((tx) => {
              const serviceName = tx.bookings?.guide_tours?.name ?? tx.bookings?.services?.name ?? '—'

              return (
                <div key={tx.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm line-clamp-1">{serviceName}</p>
                    {tx.bookings?.booking_date && (
                      <p className="text-xs text-muted-foreground">
                        {copy.booking}: {formatDate(tx.bookings.booking_date)}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">{copy.invoiceId}: </span>
                      {tx.alegra_invoice_id}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">{copy.createdAt}: </span>
                      {formatDate(tx.created_at)}
                    </p>
                  </div>

                  <div className="pt-1">
                    <CheckDianStatusButton transactionId={tx.id} />
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
