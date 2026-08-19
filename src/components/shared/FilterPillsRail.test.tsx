import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterPillsRail from './FilterPillsRail'

const items = [
  { key: 'all', label: 'Todos', href: '/negocios' },
  { key: 'restaurant', label: 'Restaurante', href: '/negocios?type=restaurant' },
  { key: 'farm', label: 'Finca', href: '/negocios?type=farm' },
]

function setDimensions(
  el: HTMLElement,
  { clientWidth, scrollWidth, scrollLeft }: { clientWidth: number; scrollWidth: number; scrollLeft: number },
) {
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, configurable: true })
}

describe('FilterPillsRail — links', () => {
  it('renders every item as a link with the given href', () => {
    render(<FilterPillsRail items={items} activeKey="all" />)
    expect(screen.getByRole('link', { name: 'Todos' })).toHaveAttribute('href', '/negocios')
    expect(screen.getByRole('link', { name: 'Restaurante' })).toHaveAttribute(
      'href',
      '/negocios?type=restaurant',
    )
    expect(screen.getByRole('link', { name: 'Finca' })).toHaveAttribute(
      'href',
      '/negocios?type=farm',
    )
  })

  it('marks only the active item', () => {
    render(<FilterPillsRail items={items} activeKey="restaurant" />)
    expect(screen.getByRole('link', { name: 'Restaurante' })).toHaveClass('bg-foreground')
    expect(screen.getByRole('link', { name: 'Todos' })).not.toHaveClass('bg-foreground')
    expect(screen.getByRole('link', { name: 'Finca' })).not.toHaveClass('bg-foreground')
  })

  it('marks nothing as active when activeKey is null', () => {
    render(<FilterPillsRail items={items} activeKey={null} />)
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label })).not.toHaveClass('bg-foreground')
    }
  })
})

describe('FilterPillsRail — content fits, no overflow', () => {
  it('renders both arrows disabled', () => {
    render(<FilterPillsRail items={items} activeKey="all" />)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })
})

describe('FilterPillsRail — content overflows', () => {
  it('enables only "next" at the start', () => {
    const { container } = render(<FilterPillsRail items={items} activeKey="all" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
    fireEvent.scroll(scrollEl)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
  })

  it('enables only "previous" at the end', () => {
    const { container } = render(<FilterPillsRail items={items} activeKey="all" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 600 })
    fireEvent.scroll(scrollEl)

    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('scrolls forward by 80% of the visible width when "next" is clicked', () => {
    const { container } = render(<FilterPillsRail items={items} activeKey="all" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 })
    fireEvent.scroll(scrollEl)

    const scrollBySpy = vi.fn()
    scrollEl.scrollBy = scrollBySpy

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(scrollBySpy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })
  })

  it('scrolls backward by 80% of the visible width when "previous" is clicked', () => {
    const { container } = render(<FilterPillsRail items={items} activeKey="all" />)
    const scrollEl = container.querySelector('.overflow-x-auto') as HTMLDivElement
    setDimensions(scrollEl, { clientWidth: 300, scrollWidth: 900, scrollLeft: 600 })
    fireEvent.scroll(scrollEl)

    const scrollBySpy = vi.fn()
    scrollEl.scrollBy = scrollBySpy

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))

    expect(scrollBySpy).toHaveBeenCalledWith({ left: -240, behavior: 'smooth' })
  })
})
