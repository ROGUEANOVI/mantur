import Link from 'next/link'
import { ChevronLeft, Store } from 'lucide-react'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import CreateBusinessForm from '@/components/mi-negocio/CreateBusinessForm'

export default function NuevoNegocioPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/mi-negocio"
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-[44px] py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Mis negocios
        </Link>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Store className="size-8 text-primary" aria-hidden="true" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{miNegocioCopy.setup.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{miNegocioCopy.setup.subtitle}</p>
        </div>

        <CreateBusinessForm />
      </div>
    </main>
  )
}
