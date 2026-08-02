import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Settings2, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { guidesCopy } from '@/lib/copy/guides'
import { cn } from '@/lib/utils'
import { uploadTourImage, deleteTourImage } from '@/app/(app)/mi-perfil-guia/actions'
import EditTourForm from '@/components/mi-perfil-guia/EditTourForm'
import ImageManager from '@/components/shared/ImageManager'

export default async function EditarTourPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: guide } = await supabase
    .from('tourist_guides')
    .select('id')
    .eq('profile_id', user!.id)
    .maybeSingle()

  if (!guide) notFound()

  const { data: tour } = await supabase
    .from('guide_tours')
    .select('id, name, description, price, capacity, duration_minutes, images')
    .eq('id', id)
    .eq('guide_id', guide.id)
    .maybeSingle()

  if (!tour) notFound()

  const images: string[] = tour.images ?? []
  const copy = guidesCopy.tourForm

  const boundUpload = uploadTourImage.bind(null, id)
  const boundDelete = deleteTourImage.bind(null, id)

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

        <h1 className="text-2xl font-bold text-foreground mb-6">{copy.editTitle}</h1>

        {/* Details section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">{copy.detailsSection}</h2>
          </div>
          <EditTourForm
            tourId={id}
            defaultValues={{
              name: tour.name,
              description: tour.description,
              price: tour.price,
              capacity: tour.capacity,
              duration_minutes: tour.duration_minutes,
            }}
          />
        </section>

        {/* Images section */}
        <section>
          <div className="flex items-center gap-2 mb-1.5">
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">{copy.imagesSection}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{copy.imagesHint}</p>
          <ImageManager
            images={images}
            maxImages={5}
            uploadAction={boundUpload}
            deleteAction={boundDelete}
          />
        </section>
      </div>
    </main>
  )
}
