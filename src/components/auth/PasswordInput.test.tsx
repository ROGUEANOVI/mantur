import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasswordInput from './PasswordInput'

describe('PasswordInput', () => {
  it('renders as a password field by default, with a "show" toggle button', () => {
    render(<PasswordInput id="pw" name="password" show={false} onToggle={() => {}} />)
    expect(screen.getByLabelText(/mostrar contraseña/i)).toBeInTheDocument()
    const input = document.getElementById('pw') as HTMLInputElement
    expect(input).toHaveAttribute('type', 'password')
  })

  it('renders as plain text with a "hide" toggle button when show is true', () => {
    render(<PasswordInput id="pw" name="password" show onToggle={() => {}} />)
    expect(screen.getByLabelText(/ocultar contraseña/i)).toBeInTheDocument()
    const input = document.getElementById('pw') as HTMLInputElement
    expect(input).toHaveAttribute('type', 'text')
  })

  it('calls onToggle when the eye button is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<PasswordInput id="pw" name="password" show={false} onToggle={onToggle} />)

    await user.click(screen.getByLabelText(/mostrar contraseña/i))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('calls onChange with the typed value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PasswordInput id="pw" name="password" show onToggle={() => {}} value="" onChange={onChange} />)

    await user.type(document.getElementById('pw') as HTMLInputElement, 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })
})
