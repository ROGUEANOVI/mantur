import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { eventsCopy } from '@/lib/copy/events'
import { createEvent } from '@/app/(app)/admin/eventos/actions'
import EventForm from '@/components/admin/EventForm'
import { loadEventFormOptions } from '../formOptions'

export default async function NuevoEventoPage() {
  const copy = eventsCopy.admin
  const { places, packages } = await loadEventFormOptions(createAdminClient())

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/admin/eventos"
          className="inline-flex min-h-11 items-center gap-1.5 py-2 text-sm font-medium text-primary hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.form.backToList}
        </Link>

        <h1 className="text-2xl font-bold text-foreground">{copy.new}</h1>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <EventForm action={createEvent} places={places} packages={packages} />
        </div>
      </div>
    </main>
  )
}
