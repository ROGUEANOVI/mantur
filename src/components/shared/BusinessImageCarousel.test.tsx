import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BusinessImageCarousel from './BusinessImageCarousel'

const IMAGES = ['https://x/a.webp', 'https://x/b.webp', 'https://x/c.webp']

describe('BusinessImageCarousel — no images', () => {
  it('renders a placeholder instead of a carousel', () => {
    const { container } = render(<BusinessImageCarousel images={[]} name="Finca X" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('BusinessImageCarousel — a single image', () => {
  it('renders the image with the business name as its label, and no arrows/dots', () => {
    render(<BusinessImageCarousel images={['https://x/a.webp']} name="Finca X" />)
    expect(screen.getByRole('img', { name: 'Finca X' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Imagen anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente imagen' })).not.toBeInTheDocument()
  })
})

describe('BusinessImageCarousel — multiple images', () => {
  it('labels the first image with the plain name and the rest with a photo index', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    expect(screen.getByRole('img', { name: 'Finca X' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Finca X — foto 2' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Finca X — foto 3' })).toBeInTheDocument()
  })

  it('starts on the first slide: no "previous" arrow, but a "next" arrow', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    expect(screen.queryByRole('button', { name: 'Imagen anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente imagen' })).toBeInTheDocument()
  })

  it('advances the scroll position and the active dot when "next" is clicked', async () => {
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente imagen' }))

    expect(scrollToSpy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
  })

  it('updates the active dot and arrow visibility as the user scrolls', () => {
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(scrollEl, 'scrollLeft', { value: 600, configurable: true })

    fireEvent.scroll(scrollEl)

    // Now on the last slide (index 2 of 3): "next" disappears, "previous" appears.
    expect(screen.getByRole('button', { name: 'Imagen anterior' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente imagen' })).not.toBeInTheDocument()
  })

  it('scrolls backward when "previous" is clicked', () => {
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(scrollEl, 'scrollLeft', { value: 600, configurable: true })
    fireEvent.scroll(scrollEl)

    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy
    fireEvent.click(screen.getByRole('button', { name: 'Imagen anterior' }))

    expect(scrollToSpy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
  })
})

describe('BusinessImageCarousel — autoplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mockReducedMotion(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia
  }

  it('auto-advances to the next slide after the autoplay interval', () => {
    mockReducedMotion(false)
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy

    vi.advanceTimersByTime(5000)

    expect(scrollToSpy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
  })

  it('does not auto-advance when the visitor prefers reduced motion', () => {
    mockReducedMotion(true)
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy

    vi.advanceTimersByTime(5000)

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('pauses on hover and resumes on mouse leave', () => {
    mockReducedMotion(false)
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const outer = container.firstChild as HTMLElement
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy

    fireEvent.mouseEnter(outer)
    vi.advanceTimersByTime(5000)
    expect(scrollToSpy).not.toHaveBeenCalled()

    fireEvent.mouseLeave(outer)
    vi.advanceTimersByTime(5000)
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' })
  })

  it('pauses permanently on touch', () => {
    mockReducedMotion(false)
    const { container } = render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    const outer = container.firstChild as HTMLElement
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy

    fireEvent.touchStart(outer)
    vi.advanceTimersByTime(10000)

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('does not auto-advance for a single slide', () => {
    mockReducedMotion(false)
    const { container } = render(<BusinessImageCarousel images={['https://x/a.webp']} name="Finca X" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy

    vi.advanceTimersByTime(10000)

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('does not auto-advance while the current slide is a video', () => {
    mockReducedMotion(false)
    const { container } = render(
      <BusinessImageCarousel images={['https://x/a.webp']} videos={['https://x/clip.mp4']} name="Finca X" />,
    )
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    Object.defineProperty(scrollEl, 'offsetWidth', { value: 300, configurable: true })
    Object.defineProperty(scrollEl, 'scrollLeft', { value: 300, configurable: true })
    fireEvent.scroll(scrollEl)

    const scrollToSpy = vi.fn()
    scrollEl.scrollTo = scrollToSpy
    vi.advanceTimersByTime(10000)

    expect(scrollToSpy).not.toHaveBeenCalled()
  })
})

describe('BusinessImageCarousel — lightbox', () => {
  afterEach(() => {
    document.body.classList.remove('overflow-hidden')
  })

  it('opens the lightbox with the full image when a slide is clicked', async () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' }))

    expect(screen.getByRole('dialog', { name: 'Finca X — foto ampliada' })).toBeInTheDocument()
    expect(document.body).toHaveClass('overflow-hidden')
  })

  it('closes when the close button is clicked', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body).not.toHaveClass('overflow-hidden')
  })

  it('closes when Escape is pressed', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when the backdrop is clicked, but not when the image area is clicked', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' }))

    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('starts on the clicked slide and only shows a "next" arrow', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' }))

    expect(screen.queryByRole('button', { name: 'Ver foto anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver foto siguiente' })).toBeInTheDocument()
  })

  it('navigates to the next image within the lightbox', () => {
    render(<BusinessImageCarousel images={IMAGES} name="Finca X" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver Finca X en tamaño completo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ver foto siguiente' }))

    expect(screen.getByRole('button', { name: 'Ver foto anterior' })).toBeInTheDocument()
  })

  it('does not open a lightbox for video slides', () => {
    render(<BusinessImageCarousel images={[]} videos={['https://x/clip.mp4']} name="Finca X" />)
    expect(screen.queryByRole('button', { name: /en tamaño completo/ })).not.toBeInTheDocument()
  })
})

describe('BusinessImageCarousel — videos', () => {
  it('renders a video-only entity as a single slide, video after the (absent) images', () => {
    const { container } = render(<BusinessImageCarousel images={[]} videos={['https://x/clip.mp4']} name="Finca X" />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', 'https://x/clip.mp4')
    expect(video).toHaveAttribute('aria-label', 'Finca X — video 1')
  })

  it('appends video slides after image slides and counts them in the dot/arrow total', () => {
    const { container } = render(
      <BusinessImageCarousel images={['https://x/a.webp']} videos={['https://x/clip.mp4']} name="Finca X" />,
    )
    expect(screen.getByRole('img', { name: 'Finca X' })).toBeInTheDocument()
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('aria-label', 'Finca X — video 2')
    expect(screen.getByRole('button', { name: 'Siguiente imagen' })).toBeInTheDocument()
  })

  it('does not render the empty-state placeholder when there are only videos', () => {
    const { container } = render(<BusinessImageCarousel images={[]} videos={['https://x/clip.mp4']} name="Finca X" />)
    expect(container.querySelector('svg')).not.toBeInTheDocument()
  })
})
