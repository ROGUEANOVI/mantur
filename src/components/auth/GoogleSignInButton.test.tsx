import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GoogleSignInButton from './GoogleSignInButton'

const signInWithOAuth = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithOAuth },
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GoogleSignInButton', () => {
  it('renders the login label', () => {
    render(<GoogleSignInButton mode="login" />)
    expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInTheDocument()
  })

  it('renders the signup label', () => {
    render(<GoogleSignInButton mode="signup" />)
    expect(screen.getByRole('button', { name: 'Regístrate con Google' })).toBeInTheDocument()
  })

  it('calls signInWithOAuth with the google provider and the callback redirect on click', async () => {
    signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    const user = userEvent.setup()
    render(<GoogleSignInButton mode="login" />)

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }))

    expect(signInWithOAuth).toHaveBeenCalledTimes(1)
    const [call] = signInWithOAuth.mock.calls[0]
    expect(call.provider).toBe('google')
    expect(call.options.redirectTo).toContain('/auth/callback')
  })
})
