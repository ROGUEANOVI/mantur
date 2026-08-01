import { Car } from 'lucide-react'
import { transportCopy } from '@/lib/copy/transport'
import TransportRequestForm from '@/components/transporte/TransportRequestForm'

export default function SolicitarTransportePage() {
  const copy = transportCopy.requestForm

  return (
    <main className="min-h-screen bg-background pb-10">
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Car className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{copy.pageTitle}</h1>
            <p className="text-sm text-muted-foreground">{copy.pageSubtitle}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <TransportRequestForm />
        </div>
      </div>
    </main>
  )
}
