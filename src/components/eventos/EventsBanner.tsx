'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ExternalLink, MapPin, Pause, Play } from 'lucide-react'
import { eventsCopy } from '@/lib/copy/events'
import type { BannerEvent } from '@/lib/events/banner'
import WhatsappButton from '@/components/shared/WhatsappButton'
import { cn } from '@/lib/utils'

// Time each event stays on screen before the banner moves on.
export const EVENT_SLIDE_MS = 7000

// Home page events banner, overlapping the bottom of the hero.
//
// Rotation borrows the story grammar visitors arriving from Instagram and
// Facebook already know: one segment per event across the top, the active
// one filling as it plays. The fill is a CSS animation and its
// animationend is what advances the slide, so pausing (hover, keyboard
// focus, the pause button) is just animation-play-state — no timers to
// keep in sync. Swiping is native scroll-snap; the scroll position is the
// source of truth for which event is active.
export default function EventsBanner({ events }: { events: BannerEvent[] }) {
  const copy = eventsCopy.banner
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [userPaused, setUserPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // Off until mounted: the server can't know the visitor's motion
  // preference, and under reduced motion the banner never auto-advances
  // (globals.css shortens every animation to ~0ms, which would otherwise
  // make animationend fire immediately and spin through the events).
  const [autoplayAllowed, setAutoplayAllowed] = useState(false)

  const total = events.length
  const rotates = total > 1

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setAutoplayAllowed(!query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const goTo = useCallback((index: number) => {
    const track = trackRef.current
    if (!track) return
    const next = (index + total) % total
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' })
    setActive(next)
  }, [total])

  function handleScroll() {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    const index = Math.round(track.scrollLeft / track.clientWidth)
    if (index !== active && index >= 0 && index < total) setActive(index)
  }

  // Keep the visible slide aligned when the viewport is resized or rotated.
  useEffect(() => {
    const track = trackRef.current
    if (!track || !rotates) return
    const observer = new ResizeObserver(() => {
      track.scrollTo({ left: active * track.clientWidth })
    })
    observer.observe(track)
    return () => observer.disconnect()
  }, [active, rotates])

  if (total === 0) return null

  const playing = rotates && autoplayAllowed && !userPaused
  const running = playing && !hovered && !focused

  return (
    <section
      aria-roledescription="carrusel"
      aria-label={copy.regionLabel}
      className="relative z-10 -mt-14 px-4"
    >
      <div
        className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl bg-bosque shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]"
        // Mouse only: on touch, a tap fires a sticky "hover" that would pause
        // the banner for good. Likewise only keyboard focus pauses it, so
        // tapping a segment doesn't stop the rotation.
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={(e) => e.target.matches(':focus-visible') && setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
        }}
      >
        <div
          ref={trackRef}
          onScroll={rotates ? handleScroll : undefined}
          className={cn(
            'scrollbar-none flex',
            rotates && 'snap-x snap-mandatory overflow-x-auto overscroll-x-contain',
          )}
        >
          {events.map((event, i) => (
            <EventSlide
              key={event.id}
              event={event}
              index={i}
              total={total}
              isActive={i === active}
              priority={i === 0}
            />
          ))}
        </div>

        {rotates && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pt-1 sm:px-5 sm:pt-2">
            <ol className="flex flex-1 gap-1.5">
              {events.map((event, i) => (
                <li key={event.id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={copy.goTo(i + 1, event.title)}
                    aria-current={i === active ? 'true' : undefined}
                    className="group/seg block w-full py-3 focus-visible:outline-none"
                  >
                    <span className="block h-1 overflow-hidden rounded-full bg-white/30 transition-colors group-hover/seg:bg-white/45 group-focus-visible/seg:ring-2 group-focus-visible/seg:ring-white group-focus-visible/seg:ring-offset-2 group-focus-visible/seg:ring-offset-bosque">
                      <span
                        // Re-keyed per activation so the fill restarts from zero.
                        key={i === active ? `on-${active}` : 'off'}
                        onAnimationEnd={i === active && playing ? () => goTo(active + 1) : undefined}
                        className={cn(
                          'block h-full origin-left rounded-full bg-white',
                          i < active && 'scale-x-100',
                          i > active && 'scale-x-0',
                          i === active && (playing ? '' : 'scale-x-100'),
                        )}
                        style={
                          i === active && playing
                            ? {
                                animation: `event-progress ${EVENT_SLIDE_MS}ms linear forwards`,
                                animationPlayState: running ? 'running' : 'paused',
                              }
                            : undefined
                        }
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            {autoplayAllowed && (
              <button
                type="button"
                onClick={() => setUserPaused((p) => !p)}
                aria-label={userPaused ? copy.play : copy.pause}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bosque/45 text-white backdrop-blur-sm transition-colors hover:bg-bosque/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {userPaused ? (
                  <Play className="size-4 fill-current" aria-hidden="true" />
                ) : (
                  <Pause className="size-4 fill-current" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function EventSlide({
  event,
  index,
  total,
  isActive,
  priority,
}: {
  event: BannerEvent
  index: number
  total: number
  isActive: boolean
  priority: boolean
}) {
  const copy = eventsCopy.banner
  const live = event.timing === 'today' || event.timing === 'ongoing'

  return (
    <article
      role="group"
      aria-roledescription="evento"
      aria-label={total > 1 ? copy.slideLabel(index + 1, total) : undefined}
      // Off-screen slides leave the tab order and the accessibility tree;
      // swiping or a segment tap makes them active again.
      inert={!isActive}
      className="relative isolate flex min-h-[27rem] w-full shrink-0 snap-center flex-col justify-end sm:min-h-[22rem] lg:min-h-[24rem]"
    >
      {event.imageUrl ? (
        <Image
          src={event.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 1024px, 100vw"
          priority={priority}
          className="-z-10 object-cover"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-20 -right-10 size-72 rounded-full bg-accent/60 blur-[90px] sm:size-96" />
          <div className="absolute -bottom-24 left-1/4 size-80 rounded-full bg-primary blur-[90px]" />
        </div>
      )}
      {/* Mobile: scrim from the bottom, under the stacked text. Desktop: from
          the left, so the photo stays readable on the right half. Both keep
          white text ≥4.5:1 over any photo. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bosque via-bosque/70 to-bosque/10 sm:bg-gradient-to-r sm:from-bosque/95 sm:via-bosque/65 sm:to-bosque/0" />
      <div className="absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-black/35 to-transparent" />

      <div className="flex flex-col gap-4 p-5 pt-16 sm:max-w-xl sm:p-8 sm:pt-16">
        <div className="flex items-center gap-3">
          {/* The date is the event's headline fact, set like a tear-off
              calendar sheet in the brand's amber. */}
          <div className="flex min-w-16 flex-col items-center rounded-xl bg-accent px-3 pb-1.5 pt-2 text-accent-foreground shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]">
            <span className="text-3xl font-extrabold leading-none tracking-tight tabular-nums sm:text-4xl">
              {event.days}
            </span>
            <span className="mt-1 text-xs font-bold uppercase tracking-wider">{event.months}</span>
          </div>
          {event.timing && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-foreground shadow-sm">
              {live && (
                <span className="relative flex size-2" aria-hidden="true">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </span>
              )}
              {copy.timing[event.timing]}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="line-clamp-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            {event.title}
          </h2>
          {event.summary && (
            <p className="line-clamp-3 max-w-prose text-sm text-white/85 sm:line-clamp-2 sm:text-base">
              {event.summary}
            </p>
          )}
        </div>

        <ul className="flex flex-col gap-1.5 text-sm font-medium text-white/90 sm:flex-row sm:flex-wrap sm:gap-x-5">
          <li className="flex items-center gap-1.5">
            <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              {event.dateLabel}
              {event.timeLabel && <span className="text-white/75"> · {event.timeLabel}</span>}
            </span>
          </li>
          {event.location && (
            <li className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-accent" aria-hidden="true" />
              {event.placeHref ? (
                <Link
                  href={event.placeHref}
                  className="truncate underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white"
                >
                  {event.location}
                </Link>
              ) : (
                <span className="truncate">{event.location}</span>
              )}
            </li>
          )}
        </ul>

        <EventCta event={event} />
      </div>
    </article>
  )
}

const LIGHT_CTA =
  'group/cta inline-flex min-h-11 items-center justify-center gap-1.5 self-start rounded-xl bg-white px-6 text-sm font-semibold text-foreground shadow-md transition-colors hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-bosque'

function EventCta({ event }: { event: BannerEvent }) {
  const copy = eventsCopy.banner
  const { cta } = event

  switch (cta.kind) {
    case 'whatsapp':
      return (
        <WhatsappButton
          message={copy.whatsappMessage(event.title, event.dateLabel)}
          label={copy.cta.whatsapp}
          tracking={{ ubicacion: 'home_event_banner' }}
          className="w-auto self-start px-6 shadow-md"
        />
      )
    case 'package':
      return (
        <Link href={cta.href} aria-label={`${copy.cta.package}: ${cta.packageName}`} className={LIGHT_CTA}>
          {copy.cta.package}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" aria-hidden="true" />
        </Link>
      )
    case 'external':
      return (
        <a href={cta.href} target="_blank" rel="noopener noreferrer" className={LIGHT_CTA}>
          {copy.cta.external}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      )
    default:
      return null
  }
}
