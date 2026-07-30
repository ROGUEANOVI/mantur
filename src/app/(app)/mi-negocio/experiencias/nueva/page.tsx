import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import CreateExperienceForm from '@/components/mi-negocio/CreateExperienceForm'

export default async function NuevaExperienciaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Fetch the business owned by this user — required to create an experience
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user!.id)
    .single()

  // No business registered yet — send back to the creation step
  if (!business) redirect('/mi-negocio')

  const copy = miNegocioCopy.experiences

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        {/* Back navigation */}
        <Link
          href="/mi-negocio/experiencias"
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-[44px] py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToExperiences}
        </Link>

        {/* Page heading */}
        <h1 className="text-2xl font-bold text-foreground mb-6">
          {copy.newTitle}
        </h1>

        <CreateExperienceForm businessId={business.id} />
      </div>
    </main>
  )
}
