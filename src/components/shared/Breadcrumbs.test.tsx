import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Breadcrumbs from './Breadcrumbs'

describe('Breadcrumbs', () => {
  it('renders every item as a link except the last, which is the current page', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'Inicio', href: '/' }, { label: 'Negocios', href: '/negocios' }, { label: 'Finca X' }]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Negocios' })).toHaveAttribute('href', '/negocios')

    const current = screen.getByText('Finca X')
    expect(current.tagName).toBe('SPAN')
    expect(current).toHaveAttribute('aria-current', 'page')
  })

  it('emits a BreadcrumbList JSON-LD script with an item URL per linked entry', () => {
    const { container } = render(
      <Breadcrumbs
        items={[{ label: 'Inicio', href: '/' }, { label: 'Negocios', href: '/negocios' }, { label: 'Finca X' }]}
      />,
    )

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).toBeInTheDocument()
    const data = JSON.parse(script!.innerHTML)

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://mantur.co/' },
      { '@type': 'ListItem', position: 2, name: 'Negocios', item: 'https://mantur.co/negocios' },
      { '@type': 'ListItem', position: 3, name: 'Finca X' },
    ])
  })
})
