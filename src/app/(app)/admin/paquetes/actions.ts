'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'

type ActionResult = { error: string } | { success: true }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRICING_UNITS = new Set(['per_person', 'per_night', 'fixed'])

async function getAuthenticatedAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return createAdminClient()
}

type ParsedPackageFields = {
  name: string
  description: string | null
  base_price: number
  pricing_unit: string
  capacity: number | null
}

function parsePackageFields(
  formData: FormData,
): { error: string } | { fields: ParsedPackageFields } {
  const copy = adminCopy.paquetes.errors

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: copy.nameRequired }

  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: copy.descriptionTooLong }
  }

  const rawPrice = formData.get('base_price') as string | null
  const basePrice = Number(rawPrice)
  if (!rawPrice || !Number.isFinite(basePrice) || basePrice < 0) {
    return { error: copy.invalidPrice }
  }

  const pricingUnit = formData.get('pricing_unit') as string
  if (!PRICING_UNITS.has(pricingUnit)) return { error: copy.invalidPricingUnit }

  const rawCapacity = formData.get('capacity') as string | null
  let capacity: number | null = null
  if (rawCapacity) {
    capacity = Number(rawCapacity)
    if (!Number.isInteger(capacity) || capacity <= 0) return { error: copy.invalidCapacity }
  }

  return {
    fields: { name, description, base_price: basePrice, pricing_unit: pricingUnit, capacity },
  }
}

export async function createPackage(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.errors

  const parsed = parsePackageFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const { error } = await admin.from('packages').insert({ ...parsed.fields, is_active: true })

  if (error) return { error: copy.generic }

  revalidatePath('/admin/paquetes')
  redirect('/admin/paquetes')
}

export async function updatePackage(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.errors

  const packageId = formData.get('packageId') as string
  if (!UUID_RE.test(packageId)) return { error: copy.notFound }

  const parsed = parsePackageFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const { data, error } = await admin
    .from('packages')
    .update(parsed.fields)
    .eq('id', packageId)
    .select('id')

  if (error || !data?.length) return { error: copy.generic }

  revalidatePath('/admin/paquetes')
  redirect('/admin/paquetes')
}

export async function togglePackageActive(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const id = formData.get('id') as string | null
  const isActive = formData.get('is_active') === 'true'

  if (!id || !UUID_RE.test(id)) return

  await admin.from('packages').update({ is_active: !isActive }).eq('id', id)

  revalidatePath('/admin/paquetes')
}

export async function deletePackage(formData: FormData): Promise<{ error: string } | void> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.errors

  const packageId = formData.get('packageId') as string
  if (!UUID_RE.test(packageId)) return { error: copy.notFound }

  const { error } = await admin.from('packages').delete().eq('id', packageId)

  if (error) {
    // 23503 = foreign_key_violation — bookings.package_id is ON DELETE
    // RESTRICT, so a package with any booking history can't be hard-deleted.
    // Surface a clear next step instead of a raw Postgres error.
    if (error.code === '23503') return { error: copy.hasBookings }
    return { error: copy.deleteError }
  }

  revalidatePath('/admin/paquetes')
}

// ── package_items ────────────────────────────────────────────────────────────

const COMPONENT_RE = /^(service|guide_tour):([0-9a-f-]{36})$/i

export async function addPackageItem(formData: FormData): Promise<{ error: string } | void> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.items.errors

  const packageId = formData.get('packageId') as string
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }

  const component = formData.get('component') as string | null
  const match = component?.match(COMPONENT_RE)
  if (!match) return { error: copy.componentRequired }
  const [, componentType, componentId] = match

  const rawCostPesos = formData.get('internal_cost_pesos') as string | null
  const costPesos = Number(rawCostPesos)
  if (!rawCostPesos || !Number.isFinite(costPesos) || costPesos < 0) {
    return { error: copy.invalidCost }
  }
  // Pesos in the UI, centavos in the DB — same unit convention as
  // transactions.amount_in_cents / provider_payouts.amount_cents.
  const internalCostCents = Math.round(costPesos * 100)

  const rawQuantity = formData.get('quantity_included') as string | null
  const quantity = rawQuantity ? Number(rawQuantity) : 1
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: copy.invalidQuantity }

  // Same predicate as the public listings' own RLS (services_select):
  // an active service/tour whose owning business/guide is no longer in
  // good standing (rejected, deactivated, paused) must not be selectable
  // here either — otherwise a package could silently misrepresent one of
  // its "vetted, trusted" providers.
  const { data: component_row } =
    componentType === 'service'
      ? await admin
          .from('services')
          .select('id, businesses!inner(status, verified)')
          .eq('id', componentId)
          .eq('status', 'active')
          .eq('businesses.status', 'active')
          .eq('businesses.verified', true)
          .maybeSingle()
      : await admin
          .from('guide_tours')
          .select('id, tourist_guides!inner(is_available)')
          .eq('id', componentId)
          .eq('status', 'active')
          .eq('tourist_guides.is_available', true)
          .maybeSingle()

  if (!component_row) return { error: copy.componentNotFound }

  const { error } = await admin.from('package_items').insert({
    package_id: packageId,
    service_id: componentType === 'service' ? componentId : null,
    guide_tour_id: componentType === 'guide_tour' ? componentId : null,
    internal_cost_cents: internalCostCents,
    quantity_included: quantity,
  })

  if (error) return { error: copy.generic }

  revalidatePath(`/admin/paquetes/${packageId}/editar`)
}

export async function removePackageItem(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const itemId = formData.get('itemId') as string | null
  const packageId = formData.get('packageId') as string | null
  if (!itemId || !UUID_RE.test(itemId)) return

  await admin.from('package_items').delete().eq('id', itemId)

  if (packageId && UUID_RE.test(packageId)) {
    revalidatePath(`/admin/paquetes/${packageId}/editar`)
  }
}

// ── Package media (Fase 2b) ──────────────────────────────────────────────────
// Same shape as the place-images/place-videos actions in
// src/app/(app)/admin/actions.ts (packages, like places, are admin-owned
// content with no owner_id — public read, admin-only write, same 10-item
// combined photo+video cap everywhere else in the app already uses).

const PACKAGE_BUCKET = 'package-images'
const PACKAGE_VIDEO_BUCKET = 'package-videos'
const MAX_PACKAGE_MEDIA = 10

const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

function validateImageFile(file: File | null): string | null {
  const copy = adminCopy.paquetes.media.errors
  if (!file || !file.size) return copy.imageRequired
  const valid = ['image/jpeg', 'image/png', 'image/webp']
  if (!valid.includes(file.type)) return copy.invalidImageType
  if (file.size > 5 * 1024 * 1024) return copy.imageTooLarge
  return null
}

function validateVideoMeta(fileType: string, fileSize: number): string | null {
  const copy = adminCopy.paquetes.media.errors
  if (!VIDEO_MIME_TYPES.includes(fileType)) return copy.invalidVideoType
  if (!fileSize || fileSize > MAX_VIDEO_BYTES) return copy.videoTooLarge
  return null
}

function videoExtension(fileType: string): string {
  switch (fileType) {
    case 'video/webm':
      return 'webm'
    case 'video/quicktime':
      return 'mov'
    default:
      return 'mp4'
  }
}

export async function uploadPackageImage(
  packageId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  const copy = adminCopy.paquetes.media.errors
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }
  const admin = await getAuthenticatedAdmin()

  const { data: pkg } = await admin
    .from('packages')
    .select('id, images, videos')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) return { error: adminCopy.paquetes.errors.notFound }

  const currentImages: string[] = pkg.images ?? []
  if (currentImages.length + (pkg.videos ?? []).length >= MAX_PACKAGE_MEDIA) {
    return { error: copy.maxExceeded }
  }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const path = `packages/${packageId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(PACKAGE_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: copy.uploadFailed }

  const { data: { publicUrl } } = admin.storage.from(PACKAGE_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('packages')
    .update({ images: [...currentImages, publicUrl] })
    .eq('id', packageId)

  if (updateError) {
    await admin.storage.from(PACKAGE_BUCKET).remove([path])
    return { error: copy.saveFailed }
  }

  revalidatePath(`/admin/paquetes/${packageId}/editar`)
}

export async function deletePackageImage(
  packageId: string,
  imageUrl: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }
  const admin = await getAuthenticatedAdmin()

  const { data: pkg } = await admin
    .from('packages')
    .select('id, images')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) return { error: adminCopy.paquetes.errors.notFound }

  const storagePath = extractStoragePath(imageUrl, PACKAGE_BUCKET)
  if (storagePath) {
    await admin.storage.from(PACKAGE_BUCKET).remove([storagePath])
  }

  const newImages = (pkg.images ?? []).filter((u: string) => u !== imageUrl)
  await admin.from('packages').update({ images: newImages }).eq('id', packageId)

  revalidatePath(`/admin/paquetes/${packageId}/editar`)
}

export async function requestPackageVideoUpload(
  packageId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<{ token: string; path: string; publicUrl: string } | { error: string }> {
  const copy = adminCopy.paquetes.media.errors
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }
  const admin = await getAuthenticatedAdmin()

  const { data: pkg } = await admin
    .from('packages')
    .select('id, images, videos')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) return { error: adminCopy.paquetes.errors.notFound }

  const currentCount = (pkg.images ?? []).length + (pkg.videos ?? []).length
  if (currentCount >= MAX_PACKAGE_MEDIA) return { error: copy.maxExceeded }

  const fileError = validateVideoMeta(fileType, fileSize)
  if (fileError) return { error: fileError }

  const path = `packages/${packageId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${videoExtension(fileType)}`

  const { data, error } = await admin.storage.from(PACKAGE_VIDEO_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: copy.videoUploadFailed }

  const { data: { publicUrl } } = admin.storage.from(PACKAGE_VIDEO_BUCKET).getPublicUrl(path)

  return { token: data.token, path: data.path, publicUrl }
}

export async function confirmPackageVideoUpload(
  packageId: string,
  path: string,
): Promise<{ error: string } | void> {
  const copy = adminCopy.paquetes.media.errors
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }
  // Never trust a client-supplied URL directly, only a path scoped to this
  // package's own folder — the public URL is derived server-side below.
  // Same check as confirmPlaceVideoUpload/confirmBusinessVideoUpload.
  if (!path.startsWith(`packages/${packageId}/`)) return { error: copy.invalidVideo }

  const admin = await getAuthenticatedAdmin()

  const { data: pkg } = await admin
    .from('packages')
    .select('id, images, videos')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) return { error: adminCopy.paquetes.errors.notFound }

  const currentVideos: string[] = pkg.videos ?? []
  if ((pkg.images ?? []).length + currentVideos.length >= MAX_PACKAGE_MEDIA) {
    return { error: copy.maxExceeded }
  }

  const { data: { publicUrl } } = admin.storage.from(PACKAGE_VIDEO_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('packages')
    .update({ videos: [...currentVideos, publicUrl] })
    .eq('id', packageId)

  if (updateError) return { error: copy.videoSaveFailed }

  revalidatePath(`/admin/paquetes/${packageId}/editar`)
}

export async function deletePackageVideo(
  packageId: string,
  videoUrl: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }
  const admin = await getAuthenticatedAdmin()

  const { data: pkg } = await admin
    .from('packages')
    .select('id, videos')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) return { error: adminCopy.paquetes.errors.notFound }

  const storagePath = extractStoragePath(videoUrl, PACKAGE_VIDEO_BUCKET)
  if (storagePath) {
    await admin.storage.from(PACKAGE_VIDEO_BUCKET).remove([storagePath])
  }

  const newVideos = (pkg.videos ?? []).filter((u: string) => u !== videoUrl)
  await admin.from('packages').update({ videos: newVideos }).eq('id', packageId)

  revalidatePath(`/admin/paquetes/${packageId}/editar`)
}
