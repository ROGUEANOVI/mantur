import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import CreateServiceForm from '@/components/mi-negocio/CreateServiceForm'

type ServiceTypeOption = {
  id: string
  slug: string
  name: string
  pricing_unit: 'per_person' | 'per_night' | 'fixed'
}

export default async function NuevoServicioPage({
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

  const [{ data: serviceTypes }, { data: categoryLinks }] = await Promise.all([
    supabase
      .from('service_types')
      .select('id, slug, name, pricing_unit')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('business_category_links')
      .select('category_id')
      .eq('business_id', id),
  ])

  const categoryIds = (categoryLinks ?? []).map((c) => c.category_id)

  const { data: suggestions } = categoryIds.length
    ? await supabase
        .from('business_category_service_type_suggestions')
        .select('service_type_id, sort_order')
        .in('category_id', categoryIds)
    : { data: [] as { service_type_id: string; sort_order: number }[] }

  // Types suggested by this business's own categories are surfaced first
  // (ordered by their suggestion sort_order); everything else in the active
  // catalog follows, ordered by its own sort_order. Pure UX ordering — the
  // full catalog is always shown regardless of suggestions.
  const suggestedOrder = new Map<string, number>()
  for (const s of suggestions ?? []) {
    const current = suggestedOrder.get(s.service_type_id)
    if (current === undefined || s.sort_order < current) {
      suggestedOrder.set(s.service_type_id, s.sort_order)
    }
  }

  const orderedTypes = [...((serviceTypes ?? []) as ServiceTypeOption[])].sort((a, b) => {
    const aSuggested = suggestedOrder.get(a.id)
    const bSuggested = suggestedOrder.get(b.id)
    if (aSuggested !== undefined && bSuggested !== undefined) return aSuggested - bSuggested
    if (aSuggested !== undefined) return -1
    if (bSuggested !== undefined) return 1
    return 0
  })

  const copy = miNegocioCopy.services

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/mi-negocio/${id}/servicios`}
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-11 py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToServices}
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">{copy.newTitle}</h1>

        <CreateServiceForm businessId={business.id} serviceTypes={orderedTypes} />
      </div>
    </main>
  )
}
