import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PasswordRequirements from './PasswordRequirements'

describe('PasswordRequirements', () => {
  it('renders the title and all four rules', () => {
    render(<PasswordRequirements password="" />)
    expect(screen.getByText('Tu contraseña requiere:')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument()
    expect(screen.getByText('Una letra mayúscula')).toBeInTheDocument()
    expect(screen.getByText('Un número')).toBeInTheDocument()
    expect(screen.getByText('Un carácter especial')).toBeInTheDocument()
  })

  it('marks every rule as unmet for an empty password', () => {
    render(<PasswordRequirements password="" />)
    expect(screen.getByText('Mínimo 8 caracteres').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Una letra mayúscula').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Un número').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Un carácter especial').closest('li')).toHaveAttribute('data-met', 'false')
  })

  it('marks rules as met once satisfied', () => {
    render(<PasswordRequirements password="Correcta1!" />)
    expect(screen.getByText('Mínimo 8 caracteres').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Una letra mayúscula').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Un número').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Un carácter especial').closest('li')).toHaveAttribute('data-met', 'true')
  })

  it('marks only the satisfied rules as met for a partially valid password', () => {
    render(<PasswordRequirements password="abcdefgh" />)
    expect(screen.getByText('Mínimo 8 caracteres').closest('li')).toHaveAttribute('data-met', 'true')
    expect(screen.getByText('Una letra mayúscula').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Un número').closest('li')).toHaveAttribute('data-met', 'false')
    expect(screen.getByText('Un carácter especial').closest('li')).toHaveAttribute('data-met', 'false')
  })
})
