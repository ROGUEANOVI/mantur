import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

/**
 * Opens the desktop avatar dropdown by clicking the trigger button whose
 * accessible name is the user's display name (full name, falling back to
 * email — see UserMenu.tsx), then returns the popup so items inside it can
 * be queried.
 */
async function openUserMenu(user: ReturnType<typeof userEvent.setup>, displayName: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(displayName.split(' ')[0] || displayName) }))
}

describe('PublicNav — guest (no session)', () => {
  it('shows a bordered "Iniciar sesión" button and a solid "Registrarse" button', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await renderPublicNav()

    const login = screen.getByRole('link', { name: 'Iniciar sesión' })
    expect(login).toHaveAttribute('href', '/login')
    expect(login.className).toMatch(/border/)

    const signup = screen.getByRole('link', { name: 'Registrarse' })
    expect(signup).toHaveAttribute('href', '/signup')
    expect(signup.className).toMatch(/bg-primary/)

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(profileSingle).not.toHaveBeenCalled()
  })

  it('always renders the main nav links', async () => {
    authGetUser.mockResolvedValue({ data: { user: null } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Explorar' })).toHaveAttribute('href', '/negocios')
    expect(screen.getByRole('link', { name: 'Lugares Imperdibles' })).toHaveAttribute('href', '/lugares')
    expect(screen.getByRole('link', { name: 'Paquetes' })).toHaveAttribute('href', '/paquetes')
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
  it('shows Mis reservas inline, and Mi perfil + Mis traslados + Únete + Cerrar sesión inside the avatar menu', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mis reservas' })).toHaveAttribute('href', '/mis-reservas')

    // Not visible until the dropdown is opened.
    expect(screen.queryByRole('menuitem', { name: 'Mi perfil' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mis traslados' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Únete' })).not.toBeInTheDocument()

    await openUserMenu(user, 'Ana Pérez')

    expect(await screen.findByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/mi-perfil')
    expect(screen.getByRole('menuitem', { name: 'Mis traslados' })).toHaveAttribute('href', '/mis-viajes')
    const join = screen.getByRole('menuitem', { name: 'Únete' })
    expect(join).toHaveAttribute('href', '/solicitar-rol')
    expect(join.className).toMatch(/text-accent/)
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('shows "Mis favoritos" in the avatar menu', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    await openUserMenu(user, 'Ana Pérez')

    expect(await screen.findByRole('menuitem', { name: 'Mis favoritos' })).toHaveAttribute(
      'href',
      '/mis-favoritos',
    )
  })

  it('shows the role label "Turista" in the dropdown header', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    await openUserMenu(user, 'Ana Pérez')

    expect(await screen.findByText('Turista')).toBeInTheDocument()
  })

  it('shows the same links flattened in the mobile drawer', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    await user.click(screen.getByRole('button', { name: /abrir menú/i }))

    const drawerLinks = await screen.findAllByRole('link', { name: 'Mis reservas' })
    expect(drawerLinks.length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Mi perfil' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Mis traslados' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Únete' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Cerrar sesión' }).length).toBeGreaterThan(0)
  })
})

describe('PublicNav — transporter', () => {
  it('shows the transporter panel link inline and Cerrar sesión inside the avatar menu', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'carlos@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'transporter', full_name: 'Carlos Ruiz' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mi panel' })).toHaveAttribute('href', '/mi-perfil-transporte')
    expect(screen.queryByRole('link', { name: 'Mis reservas' })).not.toBeInTheDocument()

    await openUserMenu(user, 'Carlos Ruiz')

    expect(await screen.findByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/mi-perfil')
    expect(screen.getByRole('menuitem', { name: 'Mis favoritos' })).toHaveAttribute('href', '/mis-favoritos')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Transportador')).toBeInTheDocument()
  })
})

describe('PublicNav — tourist_guide', () => {
  it('shows the guide panel link inline and Cerrar sesión inside the avatar menu', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'guia@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist_guide', full_name: 'Guía Local' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mi panel de guía' })).toHaveAttribute('href', '/mi-perfil-guia')

    await openUserMenu(user, 'Guía Local')

    expect(await screen.findByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/mi-perfil')
    expect(screen.getByRole('menuitem', { name: 'Mis favoritos' })).toHaveAttribute('href', '/mis-favoritos')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Guía turístico')).toBeInTheDocument()
  })
})

describe('PublicNav — business_owner', () => {
  it('shows the "Mis negocios" link inline and Cerrar sesión inside the avatar menu', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'dueño@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'business_owner', full_name: 'Dueño Negocio' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Mis negocios' })).toHaveAttribute('href', '/mi-negocio')

    await openUserMenu(user, 'Dueño Negocio')

    expect(await screen.findByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/mi-perfil')
    expect(screen.getByRole('menuitem', { name: 'Mis favoritos' })).toHaveAttribute('href', '/mis-favoritos')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Dueño de negocio')).toBeInTheDocument()
  })
})

describe('PublicNav — admin', () => {
  it('shows a plain Admin link to /admin inline and Cerrar sesión inside the avatar menu', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'admin@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'admin', full_name: 'Admin User' } })
    await renderPublicNav()

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')

    await openUserMenu(user, 'Admin User')

    expect(await screen.findByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/mi-perfil')
    expect(screen.getByRole('menuitem', { name: 'Mis favoritos' })).toHaveAttribute('href', '/mis-favoritos')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })
})

describe('PublicNav — sign out', () => {
  it('binds the sign-out button inside the dropdown to the signOut server action', async () => {
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: { role: 'tourist', full_name: 'Ana Pérez' } })
    await renderPublicNav()

    await openUserMenu(user, 'Ana Pérez')

    const signOutButton = await screen.findByRole('button', { name: 'Cerrar sesión' })
    expect(signOutButton.closest('form')).not.toBeNull()
    expect(signOutButton).toHaveAttribute('type', 'submit')
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

  it('shows the uploaded avatar photo instead of initials when avatar_url is set', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({
      data: { role: 'tourist', full_name: 'Ana Pérez', avatar_url: 'https://x/a.webp' },
    })
    const { container } = await renderPublicNav()

    const avatar = container.querySelector('[title="Ana Pérez"]')
    expect(avatar).not.toHaveTextContent('AP')
    expect(container.querySelector('img[src="https://x/a.webp"]')).toBeInTheDocument()
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
    const user = userEvent.setup()
    authGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'ana@example.com' } } })
    profileSingle.mockResolvedValue({ data: null })
    await renderPublicNav()

    expect(screen.queryByRole('link', { name: 'Mis reservas' })).not.toBeInTheDocument()

    await openUserMenu(user, 'ana@example.com')

    expect(await screen.findByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})
