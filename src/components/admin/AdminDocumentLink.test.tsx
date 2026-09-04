import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import AdminDocumentLink from './AdminDocumentLink'

const getComplianceDocumentUrlMock = vi.fn()

vi.mock('@/app/(app)/admin/actions', () => ({
  getComplianceDocumentUrl: (path: string) => getComplianceDocumentUrlMock(path),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const openMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', openMock)
})

describe('AdminDocumentLink', () => {
  it('opens the signed URL in a new tab on click', async () => {
    getComplianceDocumentUrlMock.mockResolvedValue({ url: 'https://signed.example/doc.pdf' })
    const user = userEvent.setup()
    render(<AdminDocumentLink label="RNT" path="user-1/rnt-1.pdf" />)

    await user.click(screen.getByRole('button', { name: /ver documento/i }))

    expect(getComplianceDocumentUrlMock).toHaveBeenCalledWith('user-1/rnt-1.pdf')
    expect(openMock).toHaveBeenCalledWith('https://signed.example/doc.pdf', '_blank', 'noopener,noreferrer')
  })

  it('shows a toast instead of opening a tab when the action fails', async () => {
    getComplianceDocumentUrlMock.mockResolvedValue({ error: 'No se pudo abrir el documento.' })
    const user = userEvent.setup()
    render(<AdminDocumentLink label="RNT" path="user-1/rnt-1.pdf" />)

    await user.click(screen.getByRole('button', { name: /ver documento/i }))

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('No se pudo abrir el documento.')
    })
    expect(openMock).not.toHaveBeenCalled()
  })
})
