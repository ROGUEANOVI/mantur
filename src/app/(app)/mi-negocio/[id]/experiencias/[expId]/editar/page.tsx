import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ImageIcon, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { miNegocioCopy } from '@/lib/copy/businesses'
import { cn } from '@/lib/utils'
import {
  uploadExperienceImage,
  deleteExperienceImage,
  requestExperienceVideoUpload,
  confirmExperienceVideoUpload,
  deleteExperienceVideo,
} from '@/app/(app)/mi-negocio/actions'
import EditExperienceForm from '@/components/mi-negocio/EditExperienceForm'
import MediaManager from '@/components/shared/MediaManager'

export default async function EditExperiencePage({
  params,
}: {
  params: Promise<{ id: string; expId: string }>
}) {
  const { id, expId } = await params
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

  // Verify experience belongs to this business
  const { data: experience } = await supabase
    .from('experiences')
    .select('id, name, description, price, capacity, duration_minutes, images, videos')
    .eq('id', expId)
    .eq('business_id', business.id)
    .maybeSingle()

  if (!experience) notFound()

  const copy = miNegocioCopy.experiences
  const images: string[] = experience.images ?? []
  const videos: string[] = experience.videos ?? []

  // Bind actions to this experience so MediaManager receives plain (formData) / (url) signatures
  const boundUpload = uploadExperienceImage.bind(null, expId)
  const boundDelete = deleteExperienceImage.bind(null, expId)
  const boundRequestVideo = requestExperienceVideoUpload.bind(null, expId)
  const boundConfirmVideo = confirmExperienceVideoUpload.bind(null, expId)
  const boundDeleteVideo = deleteExperienceVideo.bind(null, expId)

  return (
    <main className="min-h-screen bg-background px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/mi-negocio/${id}/experiencias`}
          className={cn(
            'inline-flex items-center gap-1.5 mb-6',
            'text-sm font-medium text-primary min-h-11 py-2',
            'hover:underline underline-offset-4',
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.backToExperiences}
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-6">{copy.editTitle}</h1>

        {/* Details section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">{copy.editDetails}</h2>
          </div>
          <EditExperienceForm
            experienceId={expId}
            defaultValues={{
              name: experience.name,
              description: experience.description,
              price: experience.price,
              capacity: experience.capacity,
              duration_minutes: experience.duration_minutes,
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
