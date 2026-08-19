import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ImageIcon, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import {
  uploadServiceImage,
  deleteServiceImage,
  requestServiceVideoUpload,
  confirmServiceVideoUpload,
  deleteServiceVideo,
} from '@/app/(app)/mi-negocio/actions'
import EditServiceForm from '@/components/mi-negocio/EditServiceForm'
import MediaManager from '@/components/shared/MediaManager'

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string; serviceId: string }>
}) {
  const { id, serviceId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Verify business ownership first
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .maybeSingle()

  if (!business) notFound()

  // Verify service belongs to this business
  const { data: service } = await supabase
    .from('services')
    .select('id, name, description, base_price, capacity, attributes, images, videos, service_types(slug, name, pricing_unit)')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .maybeSingle<{
      id: string
      name: string
      description: string | null
      base_price: number | string
      capacity: number | null
      attributes: Record<string, unknown>
      images: string[] | null
      videos: string[] | null
      service_types: { slug: string; name: string; pricing_unit: 'per_person' | 'per_night' | 'fixed' } | null
    }>()

  if (!service || !service.service_types) notFound()

  const copy = miNegocioCopy.services
  const images: string[] = service.images ?? []
  const videos: string[] = service.videos ?? []

  // Bind actions to this service so MediaManager receives plain (formData) / (url) signatures
  const boundUpload = uploadServiceImage.bind(null, serviceId)
  const boundDelete = deleteServiceImage.bind(null, serviceId)
  const boundRequestVideo = requestServiceVideoUpload.bind(null, serviceId)
  const boundConfirmVideo = confirmServiceVideoUpload.bind(null, serviceId)
  const boundDeleteVideo = deleteServiceVideo.bind(null, serviceId)

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

        <h1 className="text-2xl font-bold text-foreground mb-6">{copy.editTitle}</h1>

        {/* Details section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">{copy.editDetails}</h2>
          </div>
          <EditServiceForm
            serviceId={serviceId}
            serviceTypeName={service.service_types.name}
            serviceTypeSlug={service.service_types.slug}
            pricingUnit={service.service_types.pricing_unit}
            defaultValues={{
              name: service.name,
              description: service.description,
              base_price: service.base_price,
              capacity: service.capacity,
              attributes: service.attributes ?? {},
            }}
          />
        </section>

        {/* Images section */}
        <section>
          <div className="flex items-center gap-2 mb-1.5">
            <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">{copy.editImages}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">{copy.editImagesHint}</p>
          <MediaManager
            images={images}
            videos={videos}
            videoBucket="business-videos"
            uploadImageAction={boundUpload}
            deleteImageAction={boundDelete}
            requestVideoUploadAction={boundRequestVideo}
            confirmVideoUploadAction={boundConfirmVideo}
            deleteVideoAction={boundDeleteVideo}
          />
        </section>
      </div>
    </main>
  )
}
