import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditExperienceForm from './EditExperienceForm'

const updateExperienceMock = vi.fn()

vi.mock('@/app/(app)/mi-negocio/actions', () => ({
  updateExperience: (...args: unknown[]) => updateExperienceMock(...args),
}))

const EXP_ID = '22222222-2222-2222-2222-222222222222'

const DEFAULT_VALUES = {
  name: 'Tour por el río',
  description: 'Un paseo relajante',
  price: 45000,
  capacity: 10,
  duration_minutes: 90,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EditExperienceForm', () => {
  it('pre-populates every field from defaultValues', () => {
    render(<EditExperienceForm experienceId={EXP_ID} defaultValues={DEFAULT_VALUES} />)

    expect(screen.getByLabelText('Nombre')).toHaveValue('Tour por el río')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Un paseo relajante')
    expect(screen.getByLabelText('Precio por persona (COP)')).toHaveValue(45000)
    expect(screen.getByLabelText('Cupo máximo')).toHaveValue(10)
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(90)
  })

  it('renders empty capacity/duration inputs when those defaults are null', () => {
    render(
      <EditExperienceForm
        experienceId={EXP_ID}
        defaultValues={{ ...DEFAULT_VALUES, capacity: null, duration_minutes: null }}
      />,
    )

    expect(screen.getByLabelText('Cupo máximo')).toHaveValue(null)
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(null)
  })

  it('renders an empty description textarea when the default is null', () => {
    render(
      <EditExperienceForm
        experienceId={EXP_ID}
        defaultValues={{ ...DEFAULT_VALUES, description: null }}
      />,
    )

    expect(screen.getByLabelText('Descripción')).toHaveValue('')
  })

  it('submits the updated fields scoped to the experienceId', async () => {
    updateExperienceMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditExperienceForm experienceId={EXP_ID} defaultValues={DEFAULT_VALUES} />)

    await user.clear(screen.getByLabelText('Precio por persona (COP)'))
    await user.type(screen.getByLabelText('Precio por persona (COP)'), '60000')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateExperienceMock).toHaveBeenCalledTimes(1)
    const [calledExpId, fd] = updateExperienceMock.mock.calls[0] as [string, FormData]
    expect(calledExpId).toBe(EXP_ID)
    expect(fd.get('price')).toBe('60000')
  })

  it('shows a success message and no error after a successful save', async () => {
    updateExperienceMock.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(<EditExperienceForm experienceId={EXP_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cambios guardados.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the error message and no success status when the save fails', async () => {
    updateExperienceMock.mockResolvedValue({ error: 'No se pudo actualizar la experiencia. Intenta de nuevo.' })
    const user = userEvent.setup()
    render(<EditExperienceForm experienceId={EXP_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo actualizar la experiencia. Intenta de nuevo.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders neither status nor alert before submission', () => {
    render(<EditExperienceForm experienceId={EXP_ID} defaultValues={DEFAULT_VALUES} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('disables the submit button and shows the pending label while the action is in flight', async () => {
    let resolveAction!: (v: unknown) => void
    updateExperienceMock.mockReturnValue(new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    render(<EditExperienceForm experienceId={EXP_ID} defaultValues={DEFAULT_VALUES} />)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()

    resolveAction({ success: true })
  })
})
