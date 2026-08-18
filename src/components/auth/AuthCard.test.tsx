import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuthCard from './AuthCard'

describe('AuthCard', () => {
  it('renders its children', () => {
    render(
      <AuthCard>
        <p>Contenido del formulario</p>
      </AuthCard>,
    )
    expect(screen.getByText('Contenido del formulario')).toBeInTheDocument()
  })

  it('applies the elevated card treatment', () => {
    render(
      <AuthCard>
        <p>Contenido</p>
      </AuthCard>,
    )
    const card = screen.getByText('Contenido').parentElement
    expect(card).toHaveClass('bg-card', 'rounded-2xl', 'shadow-2xl')
  })
})
