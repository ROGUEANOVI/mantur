import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExpandableText from './ExpandableText'

function mockOverflow(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLParagraphElement.prototype, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
  Object.defineProperty(HTMLParagraphElement.prototype, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  })
}

afterEach(() => {
  // @ts-expect-error — cleaning up the per-test override
  delete HTMLParagraphElement.prototype.scrollHeight
  // @ts-expect-error — cleaning up the per-test override
  delete HTMLParagraphElement.prototype.clientHeight
})

describe('ExpandableText — short text (no overflow)', () => {
  it('renders the text with no "Leer más" toggle', () => {
    mockOverflow(40, 40)
    render(<ExpandableText text="Un lugar hermoso." />)

    expect(screen.getByText('Un lugar hermoso.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leer más' })).not.toBeInTheDocument()
  })
})

describe('ExpandableText — long text (clamped)', () => {
  it('shows "Leer más" and toggles to "Leer menos", removing the clamp', async () => {
    mockOverflow(200, 80)
    const user = userEvent.setup()
    render(<ExpandableText text="Un texto muy largo que se corta." />)

    const paragraph = screen.getByText('Un texto muy largo que se corta.')
    expect(paragraph).toHaveClass('line-clamp-4')

    const toggle = screen.getByRole('button', { name: 'Leer más' })
    await user.click(toggle)

    expect(screen.getByRole('button', { name: 'Leer menos' })).toBeInTheDocument()
    expect(paragraph).not.toHaveClass('line-clamp-4')
  })
})
