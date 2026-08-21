import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MetaDocLink from './MetaDocLink'

const getComplianceDocumentUrlMock = vi.fn()

vi.mock('@/app/(app)/admin/actions', () => ({
  getComplianceDocumentUrl: (path: string) => getComplianceDocumentUrlMock(path),
}))

const openMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', openMock)
})

describe('MetaDocLink', () => {
  it('opens the signed URL in a new tab on click', async () => {
    getComplianceDocumentUrlMock.mockResolvedValue({ url: 'https://signed.example/doc.pdf' })
    const user = userEvent.setup()
    render(<MetaDocLink label="RNT" path="user-1/rnt-1.pdf" />)

    await user.click(screen.getByRole('button', { name: /ver documento/i }))

    expect(getComplianceDocumentUrlMock).toHaveBeenCalledWith('user-1/rnt-1.pdf')
    expect(openMock).toHaveBeenCalledWith('https://signed.example/doc.pdf', '_blank', 'noopener,noreferrer')
  })

  it('shows an inline error instead of opening a tab when the action fails', async () => {
    getComplianceDocumentUrlMock.mockResolvedValue({ error: 'No se pudo abrir el documento.' })
    const user = userEvent.setup()
    render(<MetaDocLink label="RNT" path="user-1/rnt-1.pdf" />)

    await user.click(screen.getByRole('button', { name: /ver documento/i }))

    expect(await screen.findByText('No se pudo abrir el documento.')).toBeInTheDocument()
    expect(openMock).not.toHaveBeenCalled()
  })
})
