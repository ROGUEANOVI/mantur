import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PackageWhatsappCta from './PackageWhatsappCta'

// Minimal IntersectionObserver stand-in (jsdom has none) that lets each test
// decide whether the inline CTA block is on screen.
let triggerIntersection: (isIntersecting: boolean) => void = () => {}

class FakeIntersectionObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    triggerIntersection = (isIntersecting) => callback([{ isIntersecting }])
  }
  observe() {}
  disconnect() {}
}

const originalIO = globalThis.IntersectionObserver

beforeEach(() => {
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver
})

afterEach(() => {
  globalThis.IntersectionObserver = originalIO
})

const PROPS = {
  packageName: 'FullDay Manaure',
  slug: 'fullday-manaure',
  price: { label: 'Pareja', amount: '$280.000', unit: 'en total', detail: '$140.000 c/u', perPerson: 140000 },
  capacity: null,
  basePrice: 280000,
  pricingUnit: 'fixed',
}

function inlineWhatsappLink() {
  // The sticky bar is inert while the inline block is visible, so only the
  // inline link is exposed by role.
  return screen.getByRole('link', { name: 'Reservar por WhatsApp' })
}

function messageOf(link: HTMLElement) {
  return new URL(link.getAttribute('href')!).searchParams.get('text')
}

describe('PackageWhatsappCta', () => {
  it('prefills a reservation message for 2 people with the package ref, no login needed', () => {
    render(<PackageWhatsappCta {...PROPS} />)
    const link = inlineWhatsappLink()
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001006725\?/)
    expect(messageOf(link)).toBe('Hola ManTur, quiero reservar: FullDay Manaure para 2 personas (ref: fullday-manaure)')
  })

  it('updates the message as the group size changes, using the singular for 1', async () => {
    const user = userEvent.setup()
    render(<PackageWhatsappCta {...PROPS} />)

    await user.click(screen.getByRole('button', { name: 'Agregar una persona' }))
    expect(messageOf(inlineWhatsappLink())).toContain('para 3 personas')

    await user.click(screen.getByRole('button', { name: 'Quitar una persona' }))
    await user.click(screen.getByRole('button', { name: 'Quitar una persona' }))
    expect(messageOf(inlineWhatsappLink())).toContain('para 1 persona (ref')
    expect(screen.getByRole('button', { name: 'Quitar una persona' })).toBeDisabled()
  })

  it('never lets the group exceed the package capacity', async () => {
    const user = userEvent.setup()
    render(<PackageWhatsappCta {...PROPS} capacity={3} />)

    await user.click(screen.getByRole('button', { name: 'Agregar una persona' }))
    expect(screen.getByRole('button', { name: 'Agregar una persona' })).toBeDisabled()
    expect(messageOf(inlineWhatsappLink())).toContain('para 3 personas')
  })

  it('starts at the capacity when it is below the default of 2', () => {
    render(<PackageWhatsappCta {...PROPS} capacity={1} />)
    expect(messageOf(inlineWhatsappLink())).toContain('para 1 persona')
  })

  it('reveals the sticky bar only while the inline CTA is off-screen', () => {
    render(<PackageWhatsappCta {...PROPS} />)
    expect(screen.getAllByRole('link', { name: 'Reservar por WhatsApp' })).toHaveLength(1)

    act(() => triggerIntersection(false))
    const links = screen.getAllByRole('link', { name: 'Reservar por WhatsApp' })
    expect(links).toHaveLength(2)
    expect(screen.getByText('$280.000')).toBeInTheDocument()
    expect(screen.getByText('$140.000 c/u')).toBeInTheDocument()

    act(() => triggerIntersection(true))
    expect(screen.getAllByRole('link', { name: 'Reservar por WhatsApp' })).toHaveLength(1)
  })
})

describe('PackageWhatsappCta — minimum group', () => {
  it('starts at and never goes below the package minimum', async () => {
    const user = userEvent.setup()
    render(<PackageWhatsappCta {...PROPS} capacity={12} minPeople={6} />)

    expect(messageOf(inlineWhatsappLink())).toContain('para 6 personas')
    expect(screen.getByRole('button', { name: 'Quitar una persona' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Agregar una persona' }))
    expect(messageOf(inlineWhatsappLink())).toContain('para 7 personas')
  })
})
