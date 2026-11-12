import Link from 'next/link'
import { CalendarDays, Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { eventsCopy } from '@/lib/copy/events'
import { dateRangeLabel, eventPhase, todayInBogota, type EventPhase } from '@/lib/events/dates'
import { toggleEventActive } from './actions'
import ConfirmDeleteButton from '@/components/shared/ConfirmDeleteButton'
import DeleteEventForm from '@/components/admin/DeleteEventForm'
import { cn } from '@/lib/utils'

type EventListRow = {
  id: string
  title: string
  starts_on: string
  ends_on: string | null
  time_label: string | null
  image_url: string | null
  is_active: boolean
  sort_order: number
}

type ListStatus = EventPhase | 'paused'

// What the admin cares about first: what the home page shows right now,
// then what's paused, then the archive.
const STATUS_RANK: Record<ListStatus, number> = { ongoing: 0, upcoming: 1, paused: 2, finished: 3 }

const STATUS_STYLES: Record<ListStatus, string> = {
  ongoing: 'bg-primary/10 text-primary',
  upcoming: 'bg-accent/15 text-foreground',
  paused: 'bg-muted text-muted-foreground',
  finished: 'bg-muted text-muted-foreground',
}

export default async function AdminEventosPage() {
  const admin = createAdminClient()
  const copy = eventsCopy.admin
  const today = todayInBogota()

  const { data } = await admin
    .from('tourism_events')
    .select('id, title, starts_on, ends_on, time_label, image_url, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('starts_on', { ascending: true })

  const items = ((data ?? []) as EventListRow[])
    .map((event) => {
      const phase = eventPhase(event, today)
      // A finished event is finished whether or not it's paused.
      const status: ListStatus = phase !== 'finished' && !event.is_active ? 'paused' : phase
      return { event, status }
    })
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status])

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <Link
            href="/admin/eventos/nuevo"
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {copy.new}
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <CalendarDays className="mx-auto mb-3 size-10 text-muted-foreground/40" aria-hidden="true" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{copy.bannerHint}</p>
            <ul className="space-y-3">
              {items.map(({ event, status }) => (
                <li key={event.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-primary/10">
                      {event.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.image_url} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center" title={copy.noImage}>
                          <CalendarDays className="size-6 text-primary" aria-hidden="true" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLES[status])}>
                          {copy.phaseLabels[status]}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">#{event.sort_order}</span>
                      </div>
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {dateRangeLabel(event)}
                        {event.time_label && ` · ${event.time_label}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={`/admin/eventos/${event.id}/editar`}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      {copy.edit}
                    </Link>

                    {status !== 'finished' && (
                      <form action={toggleEventActive}>
                        <input type="hidden" name="id" value={event.id} />
                        <input type="hidden" name="is_active" value={String(event.is_active)} />
                        <button
                          type="submit"
                          className={cn(
                            'min-h-[36px] rounded-lg border px-2.5 text-xs font-medium transition-colors',
                            event.is_active
                              ? 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                              : 'border-primary/30 text-primary hover:bg-primary/10',
                          )}
                        >
                          {event.is_active ? copy.deactivate : copy.activate}
                        </button>
                      </form>
                    )}

                    <DeleteEventForm formId={`delete-event-${event.id}`} eventId={event.id} />
                    <ConfirmDeleteButton
                      formId={`delete-event-${event.id}`}
                      title={`${copy.confirmDeleteTitle}: ${event.title}`}
                      description={copy.confirmDeleteDescription}
                      confirmLabel={copy.confirmDeleteConfirm}
                      cancelLabel={copy.confirmDeleteCancel}
                      trigger={copy.delete}
                      triggerAriaLabel={`${copy.delete} ${event.title}`}
                      triggerClassName="inline-flex min-h-[36px] items-center rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
