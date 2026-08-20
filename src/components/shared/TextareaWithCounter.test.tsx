import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextareaWithCounter from './TextareaWithCounter'

describe('TextareaWithCounter', () => {
  it('starts the counter at 0 for an empty field', () => {
    render(
      <TextareaWithCounter id="desc" name="description" maxLength={1200} textareaClassName="" />,
    )
    expect(screen.getByText('0/1200')).toBeInTheDocument()
  })

  it('starts the counter at the length of a default value', () => {
    render(
      <TextareaWithCounter
        id="desc"
        name="description"
        defaultValue="Hola mundo"
        maxLength={1200}
        textareaClassName=""
      />,
    )
    expect(screen.getByText('10/1200')).toBeInTheDocument()
  })

  it('updates the counter as the visitor types', async () => {
    const user = userEvent.setup()
    render(
      <TextareaWithCounter id="desc" name="description" maxLength={1200} textareaClassName="" />,
    )

    await user.type(screen.getByRole('textbox'), 'Hola')

    expect(screen.getByText('4/1200')).toBeInTheDocument()
  })

  it('caps input at maxLength via the native textarea attribute', () => {
    render(
      <TextareaWithCounter id="desc" name="description" maxLength={1200} textareaClassName="" />,
    )
    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '1200')
  })

  it('associates the counter with the textarea for screen readers', () => {
    render(
      <TextareaWithCounter id="desc" name="description" maxLength={1200} textareaClassName="" />,
    )
    const textarea = screen.getByRole('textbox')
    const counterId = textarea.getAttribute('aria-describedby')
    expect(counterId).toBeTruthy()
    expect(document.getElementById(counterId!)).toHaveTextContent('0/1200')
  })
})
