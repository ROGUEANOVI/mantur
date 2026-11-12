import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import EventForm, { type EditableEvent } from './EventForm'
import { eventsCopy } from '@/lib/copy/events'

vi.mock('@/app/(app)/admin/eventos/actions', () => ({ createEvent: vi.fn(), updateEvent: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const copy = eventsCopy.admin.form
const places = [{ id: 'p1', name: 'Plaza Simón Bolívar' }]
const packages = [{ id: 'k1', name: 'FullDay' }]

const event: EditableEvent = {
  id: 'e1',
  title: 'Festival del Retorno',
  summary: null,
  starts_on: '2026-12-14',
  ends_on: null,
  time_label: null,
  location_label: null,
  place_id: null,
  cta_type: 'external',
  package_id: null,
  external_url: 'https://manaure.gov.co',
  is_active: false,
  sort_order: 2,
}

beforeEach(() => vi.clearAllMocks())

describe('EventForm', () => {
  it('defaults a new event to WhatsApp, active, with no conditional fields', () => {
    render(<EventForm action={vi.fn()} places={places} packages={packages} />)
    expect(screen.getByRole('radio', { name: new RegExp(copy.ctaOptions.whatsapp.label) })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: new RegExp(copy.isActive) })).toBeChecked()
    expect(screen.queryByRole('combobox', { name: new RegExp(`^${copy.package}`) })).not.toBeInTheDocument()
    expect(document.querySelector('input[name="external_url"]')).not.toBeInTheDocument()
  })

  it('reveals the package picker only for the package CTA', () => {
    render(<EventForm action={vi.fn()} places={places} packages={packages} />)
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(copy.ctaOptions.package.label) }))
    expect(screen.getByRole('combobox', { name: new RegExp(`^${copy.package}`) })).toBeRequired()
    expect(screen.getByRole('option', { name: 'FullDay' })).toBeInTheDocument()
  })

  it('prefills an existing event, including its external link', () => {
    render(<EventForm action={vi.fn()} event={event} places={places} packages={packages} />)
    expect(screen.getByDisplayValue('Festival del Retorno')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://manaure.gov.co')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: new RegExp(copy.isActive) })).not.toBeChecked()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  })

  it('shows the server error as a toast', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Falló' })
    const { container } = render(<EventForm action={action} event={event} places={places} packages={packages} />)
    ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falló'))
  })

  it('confirms a successful save with a toast', async () => {
    const action = vi.fn().mockResolvedValue({ success: true })
    const { container } = render(<EventForm action={action} event={event} places={places} packages={packages} />)
    ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith(copy.saved))
  })
})
