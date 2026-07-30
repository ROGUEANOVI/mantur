import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import CreateExperienceForm from '@/components/mi-negocio/CreateExperienceForm'

export default async function NuevaExperienciaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  const copy = miNegocioCopy.experiences

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/mi-negocio/${id}/experiencias`}
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-[44px] py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToExperiences}
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">{copy.newTitle}</h1>

        <CreateExperienceForm businessId={business.id} />
      </div>
    </main>
  )
}
