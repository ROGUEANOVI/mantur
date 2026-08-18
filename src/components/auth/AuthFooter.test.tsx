import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthFooter from './AuthFooter'

describe('AuthFooter', () => {
  it('renders its children', () => {
    render(
      <AuthFooter>
        <p>¿No tienes cuenta? Regístrate</p>
      </AuthFooter>,
    )
    expect(screen.getByText('¿No tienes cuenta? Regístrate')).toBeInTheDocument()
  })

  it('sits on the dark shell background with light text, not card-tuned colors', () => {
    render(
      <AuthFooter>
        <p>Contenido</p>
      </AuthFooter>,
    )
    const footer = screen.getByText('Contenido').parentElement
    expect(footer).toHaveClass('text-white/70')
  })
})
