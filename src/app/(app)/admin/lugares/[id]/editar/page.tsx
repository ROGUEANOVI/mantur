import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { updatePlace, uploadPlaceImage, deletePlaceImage } from '@/app/(app)/admin/actions'
import LugarForm from '@/components/admin/LugarForm'
import ImageManager from '@/components/shared/ImageManager'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditarLugarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const admin = createAdminClient()

  const { data: place, error } = await admin
    .from('places')
    .select('id, name, description, type, lat, lng, images')
    .eq('id', id)
    .single()

  if (error || !place) notFound()

  const boundUpload = uploadPlaceImage.bind(null, place.id)
  const boundDelete = deletePlaceImage.bind(null, place.id)

  const copy = adminCopy.lugares

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <Link
          href="/admin/lugares"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-[44px] py-2 hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.form.backToList}
        </Link>

        <h1 className="text-2xl font-bold text-foreground">{copy.edit}: {place.name}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <LugarForm
            action={updatePlace}
            place={{
              id: place.id,
              name: place.name,
              description: place.description,
              type: place.type,
              lat: place.lat,
              lng: place.lng,
            }}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Fotos</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              La primera foto es la imagen principal del lugar.
            </p>
          </div>
          <ImageManager
            images={place.images ?? []}
            maxImages={5}
            uploadAction={boundUpload}
            deleteAction={boundDelete}
          />
        </div>
      </div>
    </main>
  )
}
