import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EventsBanner from './EventsBanner'
import type { BannerEvent } from '@/lib/events/banner'
import { eventsCopy } from '@/lib/copy/events'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ priority: _p, fill: _f, ...props }: Record<string, unknown>) => <img {...props} />,
}))

const copy = eventsCopy.banner

function makeEvent(overrides: Partial<BannerEvent> = {}): BannerEvent {
  return {
    id: 'e1',
    title: 'Festival del Retorno',
    summary: 'Música y tradición en la plaza.',
    imageUrl: null,
    days: '14–16',
    months: 'dic',
    dateLabel: '14 al 16 de diciembre',
    timeLabel: 'Desde las 7:00 p. m.',
    location: 'Plaza Simón Bolívar',
    placeHref: '/lugares/plaza',
    timing: null,
    cta: { kind: 'whatsapp' },
    ...overrides,
  }
}

let reducedMotion = false

beforeEach(() => {
  reducedMotion = false
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? reducedMotion : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollTo = vi.fn()
})

const two = [makeEvent(), makeEvent({ id: 'e2', title: 'Feria Ganadera', days: '20', months: 'dic' })]

describe('EventsBanner', () => {
  it('renders nothing without events', () => {
    const { container } = render(<EventsBanner events={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a single event with no rotation controls', () => {
    render(<EventsBanner events={[makeEvent()]} />)
    expect(screen.getByRole('heading', { name: 'Festival del Retorno' })).toBeInTheDocument()
    expect(screen.getByText('14–16')).toBeInTheDocument()
    expect(screen.getByText(/14 al 16 de diciembre/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plaza Simón Bolívar' })).toHaveAttribute('href', '/lugares/plaza')
    expect(screen.queryByRole('button', { name: copy.pause })).not.toBeInTheDocument()
  })

  it('renders one segment per event and marks the first as current', () => {
    render(<EventsBanner events={two} />)
    const first = screen.getByRole('button', { name: copy.goTo(1, 'Festival del Retorno') })
    const second = screen.getByRole('button', { name: copy.goTo(2, 'Feria Ganadera') })
    expect(first).toHaveAttribute('aria-current', 'true')
    expect(second).not.toHaveAttribute('aria-current')
  })

  it('only the active slide is interactive', () => {
    const { container } = render(<EventsBanner events={two} />)
    const slides = container.querySelectorAll('article')
    expect(slides[0]).not.toHaveAttribute('inert')
    expect(slides[1]).toHaveAttribute('inert')
  })

  it('jumps to an event when its segment is pressed', () => {
    const { container } = render(<EventsBanner events={two} />)
    fireEvent.click(screen.getByRole('button', { name: copy.goTo(2, 'Feria Ganadera') }))
    expect(Element.prototype.scrollTo).toHaveBeenCalled()
    expect(container.querySelectorAll('article')[1]).not.toHaveAttribute('inert')
  })

  it('advances when the active segment finishes filling', () => {
    const { container } = render(<EventsBanner events={two} />)
    const fill = container.querySelector('[aria-current="true"] span span') as HTMLElement
    expect(fill.style.animation).toContain('event-progress')
    // jsdom has no AnimationEvent, so React listens for the prefixed name.
    fireEvent(fill, new Event('webkitAnimationEnd', { bubbles: true }))
    expect(screen.getByRole('button', { name: copy.goTo(2, 'Feria Ganadera') })).toHaveAttribute('aria-current', 'true')
  })

  it('pauses and resumes with the pause button', () => {
    const { container } = render(<EventsBanner events={two} />)
    fireEvent.click(screen.getByRole('button', { name: copy.pause }))
    const fill = container.querySelector('[aria-current="true"] span span') as HTMLElement
    expect(fill.style.animation).toBe('')
    fireEvent.click(screen.getByRole('button', { name: copy.play }))
    expect((container.querySelector('[aria-current="true"] span span') as HTMLElement).style.animation).toContain(
      'event-progress',
    )
  })

  it('never auto-advances under reduced motion, and hides the pause button', () => {
    reducedMotion = true
    const { container } = render(<EventsBanner events={two} />)
    const fill = container.querySelector('[aria-current="true"] span span') as HTMLElement
    expect(fill.style.animation).toBe('')
    expect(screen.queryByRole('button', { name: copy.pause })).not.toBeInTheDocument()
  })

  it('shows the timing chip when the event is soon or live', () => {
    render(<EventsBanner events={[makeEvent({ timing: 'today' })]} />)
    expect(screen.getByText(copy.timing.today)).toBeInTheDocument()
  })

  describe('call to action', () => {
    it('WhatsApp with the event in the prefilled message', () => {
      render(<EventsBanner events={[makeEvent()]} />)
      const link = screen.getByRole('link', { name: copy.cta.whatsapp })
      expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('Festival del Retorno')
    })

    it('related package', () => {
      render(
        <EventsBanner
          events={[makeEvent({ cta: { kind: 'package', href: '/paquetes/fullday', packageName: 'FullDay' } })]}
        />,
      )
      expect(screen.getByRole('link', { name: `${copy.cta.package}: FullDay` })).toHaveAttribute(
        'href',
        '/paquetes/fullday',
      )
    })

    it('external link opens in a new tab', () => {
      render(<EventsBanner events={[makeEvent({ cta: { kind: 'external', href: 'https://a.co' } })]} />)
      const link = screen.getByRole('link', { name: copy.cta.external })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('informational events have no button', () => {
      render(<EventsBanner events={[makeEvent({ cta: { kind: 'none' }, placeHref: null })]} />)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
  })
})
