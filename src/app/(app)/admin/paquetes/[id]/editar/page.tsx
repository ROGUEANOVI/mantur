import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import {
  updatePackage,
  uploadPackageImage,
  deletePackageImage,
  requestPackageVideoUpload,
  confirmPackageVideoUpload,
  deletePackageVideo,
} from '@/app/(app)/admin/paquetes/actions'
import PackageForm from '@/components/admin/PackageForm'
import PackageItemsManager from '@/components/admin/PackageItemsManager'
import MediaManager from '@/components/shared/MediaManager'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ItemRow = {
  id: string
  internal_cost_cents: number
  quantity_included: number
  service_id: string | null
  guide_tour_id: string | null
  services: { name: string; businesses: { name: string } | null } | null
  guide_tours: { name: string; tourist_guides: { profiles: { full_name: string | null } | null } | null } | null
}

export default async function EditarPaquetePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const admin = createAdminClient()
  const copy = adminCopy.paquetes

  const [{ data: pkg }, { data: itemsData }, { data: servicesData }, { data: guideToursData }] = await Promise.all([
    admin
      .from('packages')
      .select('id, name, description, base_price, pricing_unit, capacity, images, videos')
      .eq('id', id)
      .single(),
    admin
      .from('package_items')
      .select(
        'id, internal_cost_cents, quantity_included, service_id, guide_tour_id, services(name, businesses(name)), guide_tours(name, tourist_guides(profiles!profile_id(full_name)))',
      )
      .eq('package_id', id)
      .order('created_at', { ascending: true }),
    // !inner + filtering on the joined columns so an admin never even sees
    // a service/tour whose owning business/guide isn't in good standing as
    // an addable option — same predicate addPackageItem() enforces
    // server-side (see its own comment), kept in sync here for UX only.
    admin
      .from('services')
      .select('id, name, businesses!inner(name, status, verified)')
      .eq('status', 'active')
      .eq('businesses.status', 'active')
      .eq('businesses.verified', true)
      .order('name'),
    admin
      .from('guide_tours')
      .select('id, name, tourist_guides!inner(is_available, profiles!profile_id(full_name))')
      .eq('status', 'active')
      .eq('tourist_guides.is_available', true)
      .order('name'),
  ])

  if (!pkg) notFound()

  const boundUploadImage = uploadPackageImage.bind(null, pkg.id)
  const boundDeleteImage = deletePackageImage.bind(null, pkg.id)
  const boundRequestVideo = requestPackageVideoUpload.bind(null, pkg.id)
  const boundConfirmVideo = confirmPackageVideoUpload.bind(null, pkg.id)
  const boundDeleteVideo = deletePackageVideo.bind(null, pkg.id)

  const items =((itemsData ?? []) as unknown as ItemRow[]).map((row) => {
    const label = row.services
      ? `${row.services.name} (${row.services.businesses?.name ?? ''})`
      : `${row.guide_tours?.name ?? ''} (${row.guide_tours?.tourist_guides?.profiles?.full_name ?? ''})`
    return {
      id: row.id,
      label,
      internal_cost_cents: row.internal_cost_cents,
      quantity_included: row.quantity_included,
    }
  })

  const services = ((servicesData ?? []) as unknown as { id: string; name: string; businesses: { name: string } | null }[]).map(
    (s) => ({ id: s.id, label: `${s.name} (${s.businesses?.name ?? ''})` }),
  )

  const guideTours = (
    (guideToursData ?? []) as unknown as {
      id: string
      name: string
      tourist_guides: { profiles: { full_name: string | null } | null } | null
    }[]
  ).map((t) => ({ id: t.id, label: `${t.name} (${t.tourist_guides?.profiles?.full_name ?? ''})` }))

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <Link
          href="/admin/paquetes"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.form.backToList}
        </Link>

        <h1 className="text-2xl font-bold text-foreground">
          {copy.edit}: {pkg.name}
        </h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <PackageForm action={updatePackage} package={pkg} />
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{copy.media.title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{copy.media.hint}</p>
          </div>
          <MediaManager
            images={pkg.images ?? []}
            videos={pkg.videos ?? []}
            videoBucket="package-videos"
            uploadImageAction={boundUploadImage}
            deleteImageAction={boundDeleteImage}
            requestVideoUploadAction={boundRequestVideo}
            confirmVideoUploadAction={boundConfirmVideo}
            deleteVideoAction={boundDeleteVideo}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <PackageItemsManager packageId={pkg.id} items={items} services={services} guideTours={guideTours} />
        </div>
      </div>
    </main>
  )
}
