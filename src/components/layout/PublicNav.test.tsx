import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PublicNav from './PublicNav'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

const signOutMock = vi.fn()
vi.mock('@/app/(auth)/actions', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

const authGetUser = vi.fn()
const profileSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: authGetUser },
    from: () => ({ select: () => ({ eq: () => ({ single: profileSingle }) }) }),
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

async function renderPublicNav() {
  const ui = await PublicNav()
  return render(ui)
}

describe('PublicNav — guest (no session)', () => {
  it('shows login/signup links and no role-specific content', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Registrarse' })).toHaveAttribute('href', '/signup')
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(profileSingle).not.toHaveBeenCalled()
  })

  it('always renders the main nav links', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Explorar' })).toHaveAttribute('href', '/negocios')
    expect(screen.getByRole('link', { name: 'Lugares Imperdibles' })).toHaveAttribute('href', '/lugares')
    expect(screen.getByRole('link', { name: 'Transportadores' })).toHaveAttribute('href', '/transportistas')
    expect(screen.getByRole('link', { name: 'Guías' })).toHaveAttribute('href', '/guias')
  })

  it('renders the brand link to the homepage', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'ManTur — inicio' })).toHaveAttribute('href', '/')
  })
})

describe('PublicNav — tourist', () => {
  it('shows Mis reservas, Mis traslados, and Únete', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute('href', '/mis-reservas')
    expect(screen.getByRole('link', { name: 'Mis traslados' })).toHaveAttribute('href', '/mis-viajes')
    expect(screen.getByRole('link', { name: 'Únete' })).toHaveAttribute('href', '/solicitar-rol')
  })
})

describe('PublicNav — transporter', () => {
  it('shows the transporter panel link only', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'transporter', full_name: 'Carlos Ruiz' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mi panel' })).toHaveAttribute('href', '/mi-perfil-transporte')
    expect(screen.queryByRole('link', { name: 'Mis reservas' })).not.toBeInTheDocument()
  })
})

describe('PublicNav — tourist_guide', () => {
  it('shows the guide panel link', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist_guide', full_name: 'Guía Local' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mi panel de guía' })).toHaveAttribute('href', '/mi-perfil-guia')
  })
})

describe('PublicNav — business_owner', () => {
  it('shows the "Mis negocios" link', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'business_owner', full_name: 'Dueño Negocio' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mis negocios' })).toHaveAttribute('href', '/mi-negocio')
  })
})

describe('PublicNav — admin', () => {
  it('shows a plain Admin link to /admin', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'admin@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'admin', full_name: 'Admin User' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })
})

describe('PublicNav — sign out', () => {
  it('renders a sign-out button bound to the signOut action for any authenticated role', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})

describe('PublicNav — user avatar initials', () => {
  it('uses the first letters of the first two words of full_name', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana María Pérez' } })
    const { container } = await renderPublicNav()

    const avatar = container.querySelector('[title="Ana María Pérez"]')
    expect(avatar).toHaveTextContent('AM')
  })

  it('falls back to the email when full_name is null', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: null } })
    const { container } = await renderPublicNav()

    const avatar = container.querySelector('[title="ana@example.com"]')
    expect(avatar).toHaveTextContent('A')
  })

  it('falls back to "?" when there is neither full_name nor email', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: undefined } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: null } })
    const { container } = await renderPublicNav()

    const avatar = container.querySelector('[title=""]')
    expect(avatar).toHaveTextContent('?')
  })

  it('falls back to null role/full_name when the profile row is missing (does not crash)', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: null })
    await renderPublicNav()

    expect(screen.queryByRole('link', { name: 'Mis reservas' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})
