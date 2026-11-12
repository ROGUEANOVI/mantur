'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { eventsCopy } from '@/lib/copy/events'
import { parseEventFields, type ParsedEventFields } from '@/lib/events/parse'

// Tourism events are admin-owned editorial content (no money, no user
// data): same posture as packages and places — the admin role is checked
// here, then writes go through the service-role client.

type ActionResult = { error: string } | { success: true }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT_BUCKET = 'event-images'

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

type AdminClient = ReturnType<typeof createAdminClient>

// The form only offers existing places/packages, but the ids arrive from
// the client: confirm they're real before storing them.
async function checkReferences(admin: AdminClient, fields: ParsedEventFields): Promise<string | null> {
  const copy = eventsCopy.admin.errors
  if (fields.place_id) {
    const { data } = await admin.from('places').select('id').eq('id', fields.place_id).maybeSingle()
    if (!data) return copy.invalidPlace
  }
  if (fields.package_id) {
    const { data } = await admin.from('packages').select('id').eq('id', fields.package_id).maybeSingle()
    if (!data) return copy.invalidPackage
  }
  return null
}

function revalidateEvents(eventId?: string) {
  revalidatePath('/admin/eventos')
  if (eventId) revalidatePath(`/admin/eventos/${eventId}/editar`)
  revalidatePath('/')
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = eventsCopy.admin.errors

  const parsed = parseEventFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const refError = await checkReferences(admin, parsed.fields)
  if (refError) return { error: refError }

  const { data, error } = await admin.from('tourism_events').insert(parsed.fields).select('id').single()
  if (error || !data) return { error: copy.generic }

  revalidateEvents()
  // Straight to the edit page: the cover image is uploaded there.
  redirect(`/admin/eventos/${data.id}/editar`)
}

export async function updateEvent(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = eventsCopy.admin.errors

  const eventId = formData.get('eventId') as string | null
  if (!eventId || !UUID_RE.test(eventId)) return { error: copy.notFound }

  const parsed = parseEventFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const refError = await checkReferences(admin, parsed.fields)
  if (refError) return { error: refError }

  const { data, error } = await admin
    .from('tourism_events')
    .update(parsed.fields)
    .eq('id', eventId)
    .select('id')

  if (error) return { error: copy.generic }
  if (!data?.length) return { error: copy.notFound }

  revalidateEvents(eventId)
  return { success: true }
}

export async function toggleEventActive(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const id = formData.get('id') as string | null
  const isActive = formData.get('is_active') === 'true'
  if (!id || !UUID_RE.test(id)) return

  await admin.from('tourism_events').update({ is_active: !isActive }).eq('id', id)

  revalidateEvents(id)
}

function extractStoragePath(url: string): string | null {
  const marker = `/storage/v1/object/public/${EVENT_BUCKET}/`
  const idx = url.indexOf(marker)
  return idx === -1 ? null : url.slice(idx + marker.length)
}

export async function deleteEvent(formData: FormData): Promise<{ error: string } | void> {
  const admin = await getAuthenticatedAdmin()
  const copy = eventsCopy.admin.errors

  const eventId = formData.get('eventId') as string | null
  if (!eventId || !UUID_RE.test(eventId)) return { error: copy.notFound }

  const { data: event } = await admin.from('tourism_events').select('id, image_url').eq('id', eventId).maybeSingle()
  if (!event) return { error: copy.notFound }

  const { error } = await admin.from('tourism_events').delete().eq('id', eventId)
  if (error) return { error: copy.deleteError }

  const path = event.image_url ? extractStoragePath(event.image_url) : null
  if (path) await admin.storage.from(EVENT_BUCKET).remove([path])

  revalidateEvents()
}

function validateImageFile(file: File | null): string | null {
  const copy = eventsCopy.admin.errors
  if (!file || !file.size) return copy.imageRequired
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return copy.invalidImageType
  if (file.size > 5 * 1024 * 1024) return copy.imageTooLarge
  return null
}

// One cover per event: uploading replaces the previous image.
export async function uploadEventImage(eventId: string, formData: FormData): Promise<{ error: string } | void> {
  const copy = eventsCopy.admin.errors
  if (!UUID_RE.test(eventId)) return { error: copy.notFound }
  const admin = await getAuthenticatedAdmin()

  const { data: event } = await admin.from('tourism_events').select('id, image_url').eq('id', eventId).maybeSingle()
  if (!event) return { error: copy.notFound }

  const file = formData.get('image') as File | null
  const fileError = validateImageFile(file)
  if (fileError) return { error: fileError }

  const path = `events/${eventId}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const { error: uploadError } = await admin.storage
    .from(EVENT_BUCKET)
    .upload(path, file!, { contentType: file!.type, upsert: false })
  if (uploadError) return { error: copy.uploadFailed }

  const {
    data: { publicUrl },
  } = admin.storage.from(EVENT_BUCKET).getPublicUrl(path)

  const { error: updateError } = await admin.from('tourism_events').update({ image_url: publicUrl }).eq('id', eventId)
  if (updateError) {
    await admin.storage.from(EVENT_BUCKET).remove([path])
    return { error: copy.saveFailed }
  }

  const previous = event.image_url ? extractStoragePath(event.image_url) : null
  if (previous) await admin.storage.from(EVENT_BUCKET).remove([previous])

  revalidateEvents(eventId)
}

export async function deleteEventImage(eventId: string, imageUrl: string): Promise<{ error: string } | void> {
  const copy = eventsCopy.admin.errors
  if (!UUID_RE.test(eventId)) return { error: copy.notFound }
  const admin = await getAuthenticatedAdmin()

  const { data: event } = await admin.from('tourism_events').select('id, image_url').eq('id', eventId).maybeSingle()
  // Only the event's own current image can be removed through this action.
  if (!event || event.image_url !== imageUrl) return { error: copy.notFound }

  const path = extractStoragePath(imageUrl)
  if (path) await admin.storage.from(EVENT_BUCKET).remove([path])

  await admin.from('tourism_events').update({ image_url: null }).eq('id', eventId)

  revalidateEvents(eventId)
}
