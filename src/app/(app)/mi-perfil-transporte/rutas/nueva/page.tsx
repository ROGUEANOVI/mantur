import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { transportCopy } from '@/lib/copy/transport'
import RouteForm from '@/components/transporte/RouteForm'
import { createTransporterRoute } from '../../actions'

export default function NewTransporterRoutePage() {
  const copy = transportCopy.routes

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/mi-perfil-transporte/rutas"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline underline-offset-4"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.title}
        </Link>

        <h1 className="text-xl font-bold text-foreground">{copy.newTitle}</h1>

        <RouteForm action={createTransporterRoute} />
      </div>
    </main>
  )
}
