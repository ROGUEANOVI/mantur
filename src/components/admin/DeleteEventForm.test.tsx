import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { toast } from 'sonner'
import DeleteEventForm from './DeleteEventForm'

const deleteEventMock = vi.fn()

vi.mock('@/app/(app)/admin/eventos/actions', () => ({
  deleteEvent: (formData: FormData) => deleteEventMock(formData),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const EVENT_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => vi.clearAllMocks())

describe('DeleteEventForm', () => {
  it('renders a hidden form carrying the event id', () => {
    const { container } = render(<DeleteEventForm formId="delete-event-1" eventId={EVENT_ID} />)
    expect(container.querySelector('form#delete-event-1 input[name="eventId"]')).toHaveValue(EVENT_ID)
  })

  it('toasts the server error when the delete fails', async () => {
    deleteEventMock.mockResolvedValue({ error: 'No se pudo eliminar el evento.' })
    const { container } = render(<DeleteEventForm formId="delete-event-1" eventId={EVENT_ID} />)
    ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo eliminar el evento.'))
  })

  it('stays quiet on success', async () => {
    deleteEventMock.mockResolvedValue(undefined)
    const { container } = render(<DeleteEventForm formId="delete-event-1" eventId={EVENT_ID} />)
    ;(container.querySelector('form') as HTMLFormElement).requestSubmit()
    await vi.waitFor(() => expect(deleteEventMock).toHaveBeenCalled())
    expect(toast.error).not.toHaveBeenCalled()
  })
})
