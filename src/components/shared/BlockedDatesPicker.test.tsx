import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BlockedDatesPicker from './BlockedDatesPicker'

const COPY = {
  weekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  months: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
  prevMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  legendAvailable: 'Disponible',
  legendUnavailable: 'No disponible',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0)) // 2026-09-15
})

afterEach(() => {
  vi.useRealTimers()
})

function formValue(container: HTMLElement, name: string): string {
  return (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value
}

describe('BlockedDatesPicker', () => {
  it('renders the current month/year and a hidden input starting empty', () => {
    const { container } = render(<BlockedDatesPicker name="booking_date" blockedDates={[]} copy={COPY} />)
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()
    expect(formValue(container, 'booking_date')).toBe('')
  })

  it('renders a past day as non-interactive, not a button', () => {
    render(<BlockedDatesPicker name="booking_date" blockedDates={[]} copy={COPY} />)
    expect(screen.queryByRole('button', { name: /^10:/ })).not.toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders a blocked future day as non-interactive', () => {
    render(<BlockedDatesPicker name="booking_date" blockedDates={['2026-09-20']} copy={COPY} />)
    expect(screen.queryByRole('button', { name: /^20:/ })).not.toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('renders an available future day as a clickable button', () => {
    render(<BlockedDatesPicker name="booking_date" blockedDates={['2026-09-20']} copy={COPY} />)
    expect(screen.getByRole('button', { name: '25: Disponible' })).toBeInTheDocument()
  })

  it('selecting a day writes it into the hidden input and calls onSelect', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <BlockedDatesPicker name="booking_date" blockedDates={[]} copy={COPY} onSelect={onSelect} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '25: Disponible' }))

    expect(formValue(container, 'booking_date')).toBe('2026-09-25')
    expect(onSelect).toHaveBeenCalledWith('2026-09-25')
  })

  it('marks the selected day as pressed and highlights it', () => {
    render(<BlockedDatesPicker name="booking_date" blockedDates={[]} copy={COPY} />)

    const button = screen.getByRole('button', { name: '25: Disponible' })
    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('bg-primary')
  })

  it('navigates to the next and previous month', () => {
    render(<BlockedDatesPicker name="booking_date" blockedDates={[]} copy={COPY} />)

    fireEvent.click(screen.getByRole('button', { name: COPY.nextMonth }))
    expect(screen.getByText('Octubre 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: COPY.prevMonth }))
    fireEvent.click(screen.getByRole('button', { name: COPY.prevMonth }))
    expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
  })
})
