import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HeroControlCard from './HeroControlCard'

describe('HeroControlCard', () => {
  it('renders its children', () => {
    render(
      <HeroControlCard>
        <input placeholder="Buscar negocio..." />
      </HeroControlCard>,
    )
    expect(screen.getByPlaceholderText('Buscar negocio...')).toBeInTheDocument()
  })
})
