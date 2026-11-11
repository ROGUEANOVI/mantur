import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PackageDetailSections from './PackageDetailSections'
import type { PackageContentFields } from '@/lib/packages/content'

const EMPTY: PackageContentFields = {
  summary: null,
  itinerary: [],
  includes: [],
  what_to_bring: [],
  duration_label: null,
  meeting_point: null,
  difficulty: null,
  min_people: null,
  payment_info: null,
  cancellation_policy: null,
}

describe('PackageDetailSections', () => {
  it('renders nothing visible when the package has no structured content (no placeholders)', () => {
    const { container } = render(<PackageDetailSections content={EMPTY} tiers={[]} />)
    expect(container.querySelectorAll('section')).toHaveLength(0)
  })

  it('renders logistics, itinerary, includes and what to bring', () => {
    render(
      <PackageDetailSections
        content={{
          ...EMPTY,
          duration_label: '1 día · 8:00 a. m. a 6:00 p. m.',
          meeting_point: 'Parque principal',
          difficulty: 'media',
          min_people: 2,
          itinerary: ['Pozo Azul', 'Los Pinos'],
          includes: ['Transporte privado', 'Almuerzo criollo'],
          what_to_bring: ['Traje de baño'],
        }}
        tiers={[]}
      />,
    )

    expect(screen.getByText('1 día · 8:00 a. m. a 6:00 p. m.')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()
    expect(screen.getByText('2 personas')).toBeInTheDocument()

    const itinerary = screen.getByRole('heading', { name: 'Itinerario' }).parentElement!
    expect(within(itinerary).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1Pozo Azul', '2Los Pinos'])

    expect(screen.getByRole('heading', { name: 'Qué incluye' })).toBeInTheDocument()
    expect(screen.getByText('Almuerzo criollo')).toBeInTheDocument()
    expect(screen.getByText('Traje de baño')).toBeInTheDocument()
  })

  it('renders the group price table in tier order', () => {
    render(
      <PackageDetailSections
        content={EMPTY}
        tiers={[
          { min_people: 2, max_people: 2, amount: 280000, amount_basis: 'per_group' },
          { min_people: 3, max_people: 3, amount: 380000, amount_basis: 'per_group' },
        ]}
      />,
    )
    const rows = screen.getAllByRole('row')
    expect(rows.map((r) => r.textContent)).toEqual(['2 personas$280.000 en total', '3 personas$380.000 en total'])
  })

  it('shows provider items under "Qué incluye" even without an includes list', () => {
    render(<PackageDetailSections content={EMPTY} tiers={[]} providerItems={<p>Almuerzo — Restaurante X</p>} />)
    expect(screen.getByRole('heading', { name: 'Qué incluye' })).toBeInTheDocument()
    expect(screen.getByText('Almuerzo — Restaurante X')).toBeInTheDocument()
  })

  it('renders payment and cancellation policies when present', () => {
    render(
      <PackageDetailSections
        content={{ ...EMPTY, payment_info: 'Transferencia o Nequi.', cancellation_policy: 'Sin costo con 48 h.' }}
        tiers={[]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Formas de pago' })).toBeInTheDocument()
    expect(screen.getByText('Sin costo con 48 h.')).toBeInTheDocument()
  })
})
