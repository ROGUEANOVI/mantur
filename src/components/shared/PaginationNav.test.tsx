import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PaginationNav from './PaginationNav'

describe('PaginationNav — totalPages <= 1', () => {
  it('renders nothing', () => {
    const { container } = render(
      <PaginationNav page={1} totalPages={1} totalCount={3} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for zero pages either', () => {
    const { container } = render(
      <PaginationNav page={1} totalPages={0} totalCount={0} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PaginationNav — first page', () => {
  it('disables "Anterior" (no link) but links "Siguiente"', () => {
    render(
      <PaginationNav page={1} totalPages={3} totalCount={30} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(screen.queryByRole('link', { name: /anterior/i })).not.toBeInTheDocument()
    expect(screen.getByText(/anterior/i).tagName).toBe('SPAN')
    expect(screen.getByRole('link', { name: /siguiente/i })).toHaveAttribute('href', '/negocios?page=2')
  })

  it('shows the correct result range and page indicator', () => {
    render(
      <PaginationNav page={1} totalPages={3} totalCount={30} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(screen.getByText('1–12 de 30 resultados')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })
})

describe('PaginationNav — middle page', () => {
  it('links both "Anterior" and "Siguiente"', () => {
    render(
      <PaginationNav page={2} totalPages={3} totalCount={30} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(screen.getByRole('link', { name: /anterior/i })).toHaveAttribute('href', '/negocios?page=1')
    expect(screen.getByRole('link', { name: /siguiente/i })).toHaveAttribute('href', '/negocios?page=3')
  })

  it('caps the "to" count at totalCount on the last page', () => {
    render(
      <PaginationNav page={3} totalPages={3} totalCount={25} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(screen.getByText('25–25 de 25 resultados')).toBeInTheDocument()
  })
})

describe('PaginationNav — last page', () => {
  it('disables "Siguiente" (no link) but links "Anterior"', () => {
    render(
      <PaginationNav page={3} totalPages={3} totalCount={30} pageSize={12} baseParams={{}} basePath="/negocios" />,
    )
    expect(screen.queryByRole('link', { name: /siguiente/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /anterior/i })).toHaveAttribute('href', '/negocios?page=2')
  })
})

describe('PaginationNav — baseParams passthrough', () => {
  it('preserves extra query params in the generated links', () => {
    render(
      <PaginationNav
        page={2}
        totalPages={3}
        totalCount={30}
        pageSize={12}
        baseParams={{ q: 'balneario', category: 'resort' }}
        basePath="/negocios"
      />,
    )
    const nextHref = screen.getByRole('link', { name: /siguiente/i }).getAttribute('href')!
    const params = new URLSearchParams(nextHref.split('?')[1])
    expect(params.get('q')).toBe('balneario')
    expect(params.get('category')).toBe('resort')
    expect(params.get('page')).toBe('3')
  })
})
