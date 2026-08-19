import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AuroraHero from './AuroraHero'

describe('AuroraHero', () => {
  it('renders its children', () => {
    render(
      <AuroraHero>
        <h1>Explora Manaure</h1>
      </AuroraHero>,
    )
    expect(screen.getByRole('heading', { name: 'Explora Manaure' })).toBeInTheDocument()
  })
})
