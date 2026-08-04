'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { guidesCopy } from '@/lib/copy/guides'

type ActionResult = { error: string } | void

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOUR_BUCKET = 'business-images'
const MAX_TOUR_IMAGES = 5

async function getAuthenticatedGuide() {
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

  if (profile?.role !== 'tourist_guide') redirect('/')

  const { data: guide } = await supabase
    .from('tourist_guides')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!guide) redirect('/')

  return { supabase, userId: user.id, guideId: guide.id }
}

const VALID_SPECIALTIES = new Set([
  'ecotourism','history_culture','local_gastronomy','adventure','photography',
  'birdwatching','cultural','religious','rural',
])
const VALID_LANGUAGES = new Set(['spanish','english','french','portuguese','indigenous'])

export async function updateGuideProfile(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedGuide()

  const phone = ((formData.get('phone') as string | null) ?? '').trim()
  const bio = (formData.get('bio') as string | null)?.trim() || null
  const specialties = (formData.getAll('specialties') as string[]).filter((s) => VALID_SPECIALTIES.has(s))
  const languages = (formData.getAll('languages') as string[]).filter((l) => VALID_LANGUAGES.has(l))

  if (!phone) return { error: guidesCopy.editProfile.phone + ' es obligatorio.' }

  const { error } = await supabase
    .from('tourist_guides')
    .update({ phone, bio, specialties, languages })
    .eq('profile_id', userId)

  if (error) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  redirect('/mi-perfil-guia')
}

export async function toggleGuideAvailability(): Promise<ActionResult> {
  const { supabase, guideId } = await getAuthenticatedGuide()

  const { data: current } = await supabase
    .from('tourist_guides')
    .select('is_available')
    .eq('id', guideId)
    .single()

  if (!current) return { error: guidesCopy.errors.generic }

  const { error } = await supabase
    .from('tourist_guides')
    .update({ is_available: !current.is_available })
    .eq('id', guideId)

  if (error) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  revalidatePath('/guias')
}

function parsePrice(raw: string): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function createGuideTour(formData: FormData): Promise<ActionResult> {
  const { guideId } = await getAuthenticatedGuide()

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: guidesCopy.errors.nameRequired }

  const rawPrice = formData.get('price') as string
  const price = parsePrice(rawPrice)
  if (price === null) return { error: guidesCopy.errors.priceInvalid }

  const description = (formData.get('description') as string | null)?.trim() || null

  const rawCapacity = formData.get('capacity') as string
  const capacity = rawCapacity ? parseInt(rawCapacity, 10) : 1
  if (!Number.isInteger(capacity) || capacity < 1) return { error: guidesCopy.errors.capacityInvalid }

  const rawDuration = formData.get('duration_minutes') as string
  const durationMinutes = rawDuration ? parseInt(rawDuration, 10) : null
  const validDuration = durationMinutes === null || (Number.isInteger(durationMinutes) && durationMinutes > 0)
  if (!validDuration) return { error: guidesCopy.errors.generic }

  const admin = createAdminClient()

  const { error } = await admin.from('guide_tours').insert({
    guide_id: guideId,
    name,
    description,
    price,
    capacity,
    duration_minutes: durationMinutes || null,
    status: 'active',
  })

  if (error) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  redirect('/mi-perfil-guia')
}

export async function updateGuideTour(
  tourId: string,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const { guideId } = await getAuthenticatedGuide()
  if (!UUID_RE.test(tourId)) return { error: guidesCopy.errors.notFound }

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: guidesCopy.errors.nameRequired }

  const rawPrice = formData.get('price') as string
  const price = parsePrice(rawPrice)
  if (price === null) return { error: guidesCopy.errors.priceInvalid }

  const description = (formData.get('description') as string | null)?.trim() || null

  const rawCapacity = formData.get('capacity') as string
  const capacity = rawCapacity ? parseInt(rawCapacity, 10) : 1
  if (!Number.isInteger(capacity) || capacity < 1) return { error: guidesCopy.errors.capacityInvalid }

  const rawDuration = formData.get('duration_minutes') as string
  const durationMinutes = rawDuration ? parseInt(rawDuration, 10) : null
  const validDuration = durationMinutes === null || (Number.isInteger(durationMinutes) && durationMinutes > 0)
  if (!validDuration) return { error: guidesCopy.errors.generic }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('guide_tours')
    .update({ name, description, price, capacity, duration_minutes: durationMinutes || null })
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .select('id')

  if (error || !data?.length) return { error: guidesCopy.errors.generic }

  revalidatePath('/mi-perfil-guia')
  return { success: true }
}

export async function toggleTourStatus(formData: FormData): Promise<void> {
  const { guideId } = await getAuthenticatedGuide()

  const tourId = formData.get('tourId') as string
  if (!UUID_RE.test(tourId)) return

  const supabase = await createClient()
  const { data: tour } = await supabase
    .from('guide_tours')
    .select('status')
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .single()

  if (!tour) return

  const admin = createAdminClient()
  await admin
    .from('guide_tours')
    .update({ status: tour.status === 'active' ? 'inactive' : 'active' })
    .eq('id', tourId)

  revalidatePath('/mi-perfil-guia')
}

function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

function validateImageFile(file: File | null): string | null {
  if (!file || !file.size) return 'Selecciona una imagen.'
  const valid = ['image/jpeg', 'image/png', 'image/webp']
  if (!valid.includes(file.type)) return 'Formato no válido. Usa JPEG, PNG o WebP.'
  if (file.size > 5 * 1024 * 1024) return 'La imagen no puede superar 5 MB.'
  return null
}

export async function uploadTourImage(
  tourId: string,
  formData: FormData,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(tourId)) return { error: guidesCopy.errors.notFound }
  const { guideId } = await getAuthenticatedGuide()
  const admin = createAdminClient()

  const { data: tour } = await admin
    .from('guide_tours')
    .select('id, images')
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .maybeSingle()

  if (!tour) return { error: guidesCopy.errors.notFound }

  const currentImages: string[] = tour.images ?? []
  if (currentImages.length >= MAX_TOUR_IMAGES) {
    return { error: `Máximo ${MAX_TOUR_IMAGES} fotos por tour.` }
  }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const path = `guide-tours/${tourId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`

  const { error: uploadError } = await admin.storage
    .from(TOUR_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })

  if (uploadError) return { error: 'No se pudo subir la imagen. Intenta de nuevo.' }

  const { data: { publicUrl } } = admin.storage.from(TOUR_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin
    .from('guide_tours')
    .update({ images: [...currentImages, publicUrl] })
    .eq('id', tourId)

  if (updateError) {
    await admin.storage.from(TOUR_BUCKET).remove([path])
    return { error: 'No se pudo guardar la imagen.' }
  }

  revalidatePath('/mi-perfil-guia')
  revalidatePath('/guias')
}

export async function deleteTourImage(
  tourId: string,
  imageUrl: string,
): Promise<{ error: string } | void> {
  if (!UUID_RE.test(tourId)) return { error: guidesCopy.errors.notFound }
  const { guideId } = await getAuthenticatedGuide()
  const admin = createAdminClient()

  const { data: tour } = await admin
    .from('guide_tours')
    .select('id, images')
    .eq('id', tourId)
    .eq('guide_id', guideId)
    .maybeSingle()

  if (!tour) return { error: guidesCopy.errors.notFound }

  const storagePath = extractStoragePath(imageUrl, TOUR_BUCKET)
  if (storagePath) {
    await admin.storage.from(TOUR_BUCKET).remove([storagePath])
  }

  const newImages = (tour.images ?? []).filter((u: string) => u !== imageUrl)
  await admin.from('guide_tours').update({ images: newImages }).eq('id', tourId)

  revalidatePath('/mi-perfil-guia')
  revalidatePath('/guias')
}
