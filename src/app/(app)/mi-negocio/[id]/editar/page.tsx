import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import EditBusinessForm from '@/components/mi-negocio/EditBusinessForm'

export default async function EditarNegocioPage({
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
    .select('id, name, type, description, address, phone')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/mi-negocio/${id}`}
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-[44px] py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {business.name}
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">Editar negocio</h1>

        <EditBusinessForm
          businessId={business.id}
          defaultValues={{
            name: business.name,
            type: business.type,
            description: business.description,
            address: business.address,
            phone: business.phone,
          }}
        />
      </div>
    </main>
  )
}
