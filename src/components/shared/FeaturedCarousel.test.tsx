import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeaturedCarousel from './FeaturedCarousel'

function Item({ width = 256 }: { width?: number }) {
  return <div data-carousel-item style={{ width }} />
}

function setDimensions(
  el: HTMLElement,
  { clientWidth, scrollWidth, scrollLeft }: { clientWidth: number; scrollWidth: number; scrollLeft: number },
) {
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, configurable: true })
}

describe('FeaturedCarousel — content fits, no overflow', () => {
  it('renders no arrows', () => {
    render(
      <FeaturedCarousel>
        <Item />
      </FeaturedCarousel>,
    )
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
  })
})

describe('FeaturedCarousel — content overflows', () => {
  it('shows only the "next" arrow at the start', () => {
    const { container } = render(
      <FeaturedCarousel>
        <Item />
      </FeaturedCarousel>,
    )
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
    fireEvent.scroll(scrollEl)

    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
  })

  it('shows only the "previous" arrow at the end', () => {
    const { container } = render(
      <FeaturedCarousel>
        <Item />
      </FeaturedCarousel>,
    )
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 600 })
    fireEvent.scroll(scrollEl)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
  })

  it('shows both arrows in the middle', () => {
    const { container } = render(
      <FeaturedCarousel>
        <Item />
      </FeaturedCarousel>,
    )
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 300 })
    fireEvent.scroll(scrollEl)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
  })

  it('scrolls forward by one item width plus the gap when "next" is clicked', () => {
    const { container } = render(
      <FeaturedCarousel>
        <Item width={256} />
      </FeaturedCarousel>,
    )
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
    fireEvent.scroll(scrollEl)

    const item = container.querySelector('[data-carousel-item]') as HTMLElement
    Object.defineProperty(item, 'offsetWidth', { value: 256, configurable: true })
    const scrollBySpy = vi.fn()
    scrollEl.scrollBy = scrollBySpy

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(scrollBySpy).toHaveBeenCalledWith({ left: 272, behavior: 'smooth' })
  })

  it('scrolls backward by one item width plus the gap when "previous" is clicked', () => {
    const { container } = render(
      <FeaturedCarousel>
        <Item width={256} />
      </FeaturedCarousel>,
    )
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 600 })
    fireEvent.scroll(scrollEl)

    const item = container.querySelector('[data-carousel-item]') as HTMLElement
    Object.defineProperty(item, 'offsetWidth', { value: 256, configurable: true })
    const scrollBySpy = vi.fn()
    scrollEl.scrollBy = scrollBySpy

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))

    expect(scrollBySpy).toHaveBeenCalledWith({ left: -272, behavior: 'smooth' })
  })

  it('falls back to 80% of the visible width when there is no measurable item', () => {
    const { container } = render(<FeaturedCarousel>{null}</FeaturedCarousel>)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
    fireEvent.scroll(scrollEl)

    const scrollBySpy = vi.fn()
    scrollEl.scrollBy = scrollBySpy

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(scrollBySpy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })
  })
})
