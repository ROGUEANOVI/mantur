import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SearchInput from './SearchInput'

const routerReplaceMock = vi.fn()
let searchParamsValue = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  usePathname: () => '/negocios',
  useSearchParams: () => searchParamsValue,
}))

beforeEach(() => {
  vi.clearAllMocks()
  searchParamsValue = new URLSearchParams()
})

describe('SearchInput', () => {
  it('syncs the initial value from the "q" URL param after mount', () => {
    searchParamsValue = new URLSearchParams('q=balneario')
    render(<SearchInput placeholder="Buscar..." />)
    expect(screen.getByPlaceholderText('Buscar...')).toHaveValue('balneario')
  })

  it('starts empty when there is no "q" param', () => {
    render(<SearchInput placeholder="Buscar..." />)
    expect(screen.getByPlaceholderText('Buscar...')).toHaveValue('')
  })

  it('shows no clear button when the input is empty', () => {
    render(<SearchInput placeholder="Buscar..." />)
    expect(screen.queryByRole('button', { name: 'Limpiar búsqueda' })).not.toBeInTheDocument()
  })

  it('debounces navigation: does not call router.replace immediately on keystroke', () => {
    vi.useFakeTimers()
    render(<SearchInput placeholder="Buscar..." />)

    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'pozo' } })
    expect(routerReplaceMock).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('resets the debounce timer on rapid successive keystrokes, only navigating once', () => {
    vi.useFakeTimers()
    render(<SearchInput placeholder="Buscar..." />)

    const input = screen.getByPlaceholderText('Buscar...')
    fireEvent.change(input, { target: { value: 'po' } })
    vi.advanceTimersByTime(200)
    fireEvent.change(input, { target: { value: 'poz' } })
    vi.advanceTimersByTime(200)
    expect(routerReplaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(routerReplaceMock).toHaveBeenCalledTimes(1)
    expect(routerReplaceMock).toHaveBeenCalledWith('/negocios?q=poz', { scroll: false })

    vi.useRealTimers()
  })

  it('calls router.replace with the "q" param after the debounce delay', () => {
    vi.useFakeTimers()
    render(<SearchInput placeholder="Buscar..." />)

    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'pozo' } })
    vi.advanceTimersByTime(350)

    expect(routerReplaceMock).toHaveBeenCalledWith('/negocios?q=pozo', { scroll: false })

    vi.useRealTimers()
  })

  it('removes the "q" and "page" params when cleared to empty via typing', () => {
    vi.useFakeTimers()
    searchParamsValue = new URLSearchParams('q=pozo&page=2')
    render(<SearchInput placeholder="Buscar..." />)

    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: '' } })
    vi.advanceTimersByTime(350)

    expect(routerReplaceMock).toHaveBeenCalledWith('/negocios?', { scroll: false })

    vi.useRealTimers()
  })

  it('clicking the clear button empties the field and navigates immediately (no debounce wait)', () => {
    searchParamsValue = new URLSearchParams('q=pozo')
    render(<SearchInput placeholder="Buscar..." />)

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))

    expect(screen.getByPlaceholderText('Buscar...')).toHaveValue('')
    expect(routerReplaceMock).toHaveBeenCalledWith('/negocios?', { scroll: false })
  })

  it('applies dark-variant styling when dark is true', () => {
    render(<SearchInput placeholder="Buscar..." dark />)
    expect(screen.getByPlaceholderText('Buscar...')).toHaveClass('bg-white/15')
  })

  it('applies the default styling when dark is false', () => {
    render(<SearchInput placeholder="Buscar..." />)
    expect(screen.getByPlaceholderText('Buscar...')).toHaveClass('bg-card')
  })

  it('applies dark-variant styling to the clear button when dark is true', () => {
    searchParamsValue = new URLSearchParams('q=pozo')
    render(<SearchInput placeholder="Buscar..." dark />)
    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toHaveClass('text-white/60')
  })

  it('applies the default styling to the clear button when dark is false', () => {
    searchParamsValue = new URLSearchParams('q=pozo')
    render(<SearchInput placeholder="Buscar..." />)
    expect(screen.getByRole('button', { name: 'Limpiar búsqueda' })).toHaveClass('text-muted-foreground')
  })
})
