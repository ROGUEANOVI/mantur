import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import WeeklyAvailabilityPattern from './WeeklyAvailabilityPattern'

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

const COPY = {
  weekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  markUnavailable: 'Marcar no disponible',
  markAvailable: 'Marcar disponible',
  weeklyPatternTitle: 'Patrón semanal',
  weeklyPatternSubtitle: 'Las marcas puntuales siempre tienen prioridad.',
}

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111'

function formValues(fd: FormData) {
  return Object.fromEntries(fd.entries())
}

describe('WeeklyAvailabilityPattern', () => {
  it('renders the title/subtitle and all seven weekday cells', () => {
    render(
      <WeeklyAvailabilityPattern
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableWeekdays={[]}
        copy={COPY}
      />,
    )

    expect(screen.getByText('Patrón semanal')).toBeInTheDocument()
    for (const wd of COPY.weekdays) {
      expect(screen.getByRole('button', { name: `${wd}: Marcar no disponible` })).toBeInTheDocument()
    }
  })

  it('shows a weekday already marked unavailable with the flip-to-available action', () => {
    // Mar (index 1) maps to weekday 2 (Tuesday) — see the (i+1)%7 mapping in the component.
    render(
      <WeeklyAvailabilityPattern
        providerType="business"
        providerId={PROVIDER_ID}
        action={vi.fn()}
        unavailableWeekdays={[2]}
        copy={COPY}
      />,
    )

    const button = screen.getByRole('button', { name: 'Mar: Marcar disponible' })
    expect(button).toHaveClass('bg-red-100')
  })

  it('submits the correct hidden fields for the real weekday number, not the display column index', async () => {
    const actionMock = vi.fn().mockResolvedValue(undefined)

    render(
      <WeeklyAvailabilityPattern
        providerType="guide"
        providerId={PROVIDER_ID}
        action={actionMock}
        unavailableWeekdays={[]}
        copy={COPY}
      />,
    )

    // Lun is the first displayed column but weekday 1 (Monday), not 0.
    fireEvent.click(screen.getByRole('button', { name: 'Lun: Marcar no disponible' }))

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1))
    const values = formValues(actionMock.mock.calls[0][0] as FormData)
    expect(values).toEqual({
      businessId: PROVIDER_ID,
      providerId: PROVIDER_ID,
      providerType: 'guide',
      weekday: '1',
      status: 'unavailable',
    })
  })

  it('flips status to available when clicking an already-unavailable weekday', async () => {
    const actionMock = vi.fn().mockResolvedValue(undefined)

    render(
      <WeeklyAvailabilityPattern
        providerType="transporter"
        providerId={PROVIDER_ID}
        action={actionMock}
        unavailableWeekdays={[2]}
        copy={COPY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mar: Marcar disponible' }))

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1))
    const values = formValues(actionMock.mock.calls[0][0] as FormData)
    expect(values.status).toBe('available')
    expect(values.weekday).toBe('2')
  })

  it('shows an error toast when the action fails', async () => {
    const actionMock = vi.fn().mockResolvedValue({ error: 'Ocurrió un error. Intenta de nuevo.' })

    render(
      <WeeklyAvailabilityPattern
        providerType="business"
        providerId={PROVIDER_ID}
        action={actionMock}
        unavailableWeekdays={[]}
        copy={COPY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Lun: Marcar no disponible' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Ocurrió un error. Intenta de nuevo.'))
  })
})
