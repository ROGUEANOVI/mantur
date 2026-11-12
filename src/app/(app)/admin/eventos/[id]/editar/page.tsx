import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { eventsCopy } from '@/lib/copy/events'
import { deleteEventImage, updateEvent, uploadEventImage } from '@/app/(app)/admin/eventos/actions'
import EventForm, { type EditableEvent } from '@/components/admin/EventForm'
import ImageManager from '@/components/shared/ImageManager'
import { loadEventFormOptions } from '../../formOptions'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditarEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const admin = createAdminClient()
  const copy = eventsCopy.admin

  const [{ data: event }, { places, packages }] = await Promise.all([
    admin
      .from('tourism_events')
      .select(
        'id, title, summary, starts_on, ends_on, time_label, location_label, place_id, cta_type, package_id, ' +
          'external_url, is_active, sort_order, image_url',
      )
      .eq('id', id)
      .maybeSingle<EditableEvent & { image_url: string | null }>(),
    loadEventFormOptions(admin),
  ])

  if (!event) notFound()

  // Keep a linked package selectable even if it has since been deactivated,
  // so the select doesn't silently drop it when the form is saved.
  let packageOptions = packages
  if (event.package_id && !packages.some((p) => p.id === event.package_id)) {
    const { data: linked } = await admin.from('packages').select('id, name').eq('id', event.package_id).maybeSingle()
    if (linked) packageOptions = [...packages, { id: linked.id, name: copy.form.inactivePackage(linked.name) }]
  }

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-6">
        <Link
          href="/admin/eventos"
          className="inline-flex min-h-11 items-center gap-1.5 py-2 text-sm font-medium text-primary hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.form.backToList}
        </Link>

        <h1 className="text-2xl font-bold text-foreground">
          {copy.edit}: {event.title}
        </h1>

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-foreground">{copy.image.title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.image.hint}</p>
          </div>
          <ImageManager
            images={event.image_url ? [event.image_url] : []}
            maxImages={1}
            uploadAction={uploadEventImage.bind(null, event.id)}
            deleteAction={deleteEventImage.bind(null, event.id)}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <EventForm action={updateEvent} event={event} places={places} packages={packageOptions} />
        </div>
      </div>
    </main>
  )
}
