import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { guidesCopy } from '@/lib/copy/guides'
import CreateTourForm from '@/components/mi-perfil-guia/CreateTourForm'

export default function NuevoTourPage() {
  const copy = guidesCopy.tourForm

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/mi-perfil-guia"
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-11 py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToPanel}
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">{copy.createTitle}</h1>

        <CreateTourForm />
      </div>
    </main>
  )
}
