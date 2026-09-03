import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/actions'
import { landingCopy } from '@/lib/copy/landing'
import NavMobileMenu from './NavMobileMenu'
import NavLink from './NavLink'
import UserMenu, { type UserMenuLink } from './UserMenu'
import ManturLogo from '@/components/shared/ManturLogo'

const PRIMARY_LINK_CLASS =
  'text-sm text-muted-foreground hover:text-foreground px-3 min-h-11 flex items-center rounded-lg hover:bg-muted/50 transition-colors'
const PRIMARY_LINK_ACTIVE_CLASS = 'text-foreground font-semibold bg-muted/40'
const SECONDARY_LINK_CLASS =
  'text-sm text-muted-foreground hover:text-foreground px-3 min-h-11 flex items-center rounded-lg hover:bg-muted/50 transition-colors'
const SECONDARY_LINK_ACTIVE_CLASS = 'text-foreground font-semibold bg-muted/40'
const ACCENT_LINK_CLASS =
  'text-sm font-medium text-accent hover:text-accent/80 px-3 min-h-11 flex items-center rounded-lg hover:bg-accent/10 transition-colors'
const ACCENT_LINK_ACTIVE_CLASS = 'text-accent font-semibold bg-accent/10'

export default async function PublicNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let role: string | null = null
  let fullName: string | null = null
  let avatarUrl: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, avatar_url')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null
    fullName = profile?.full_name ?? null
    avatarUrl = profile?.avatar_url ?? null
  }

  const copy = landingCopy.nav

  const navLinks = [
    { label: copy.negocios, href: '/negocios' },
    { label: copy.lugares, href: '/lugares' },
    { label: copy.paquetes, href: '/paquetes' },
    { label: copy.transportistas, href: '/transportistas' },
    { label: copy.guias, href: '/guias' },
  ]

  // Per role: one link stays visible inline next to the avatar menu; the
  // rest moves into the UserMenu dropdown (desktop) / flat rows (mobile).
  let primaryLink: { label: string; href: string; isAdmin?: boolean } | null = null
  let secondaryLinks: UserMenuLink[] = []

  switch (role) {
    case 'tourist':
      primaryLink = { label: copy.myBookings, href: '/mis-reservas' }
      secondaryLinks = [
        { label: copy.myProfile, href: '/mi-perfil' },
        { label: copy.myFavorites, href: '/mis-favoritos' },
        { label: copy.myTrips, href: '/mis-viajes' },
        { label: copy.joinMantur, href: '/solicitar-rol', accent: true },
      ]
      break
    case 'transporter':
      primaryLink = { label: copy.myTransport, href: '/mi-perfil-transporte' }
      secondaryLinks = [
        { label: copy.myProfile, href: '/mi-perfil' },
        { label: copy.myFavorites, href: '/mis-favoritos' },
      ]
      break
    case 'tourist_guide':
      primaryLink = { label: copy.myGuidePanel, href: '/mi-perfil-guia' }
      secondaryLinks = [
        { label: copy.myProfile, href: '/mi-perfil' },
        { label: copy.myFavorites, href: '/mis-favoritos' },
      ]
      break
    case 'business_owner':
      primaryLink = { label: copy.myBusiness, href: '/mi-negocio' }
      secondaryLinks = [
        { label: copy.myProfile, href: '/mi-perfil' },
        { label: copy.myFavorites, href: '/mis-favoritos' },
      ]
      break
    case 'admin':
      primaryLink = { label: copy.admin, href: '/admin', isAdmin: true }
      secondaryLinks = [
        { label: copy.myProfile, href: '/mi-perfil' },
        { label: copy.myFavorites, href: '/mis-favoritos' },
      ]
      break
    default:
      break
  }

  // Same primary-link element reused in both the desktop cluster and the
  // mobile drawer (mirrors how the whole auth block was shared pre-refactor).
  const primaryLinkEl = primaryLink ? (
    primaryLink.isAdmin ? (
      <Link
        href={primaryLink.href}
        className="text-sm font-medium text-primary px-3 min-h-11 flex items-center rounded-lg hover:bg-primary/10 transition-colors"
      >
        {primaryLink.label}
      </Link>
    ) : (
      <NavLink
        href={primaryLink.href}
        className={PRIMARY_LINK_CLASS}
        activeClassName={PRIMARY_LINK_ACTIVE_CLASS}
      >
        {primaryLink.label}
      </NavLink>
    )
  ) : null

  const signOutButton = (
    <form action={signOut}>
      <button
        type="submit"
        className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-11 flex items-center rounded-lg hover:bg-muted/50 transition-colors whitespace-nowrap"
      >
        {copy.signout}
      </button>
    </form>
  )

  // Desktop: primary link + avatar dropdown holding everything else.
  const desktopAuthContent = user ? (
    <div className="flex items-center gap-1">
      {primaryLinkEl}
      <UserMenu fullName={fullName} email={user.email ?? null} role={role} avatarUrl={avatarUrl} links={secondaryLinks} />
    </div>
  ) : (
    <GuestActions copy={copy} />
  )

  // Mobile drawer: same links, flattened — no nested dropdown inside a drawer.
  const mobileAuthContent = user ? (
    <div className="flex flex-col gap-2">
      {primaryLinkEl}
      {secondaryLinks.map((link) => (
        <NavLink
          key={link.href}
          href={link.href}
          className={link.accent ? ACCENT_LINK_CLASS : SECONDARY_LINK_CLASS}
          activeClassName={link.accent ? ACCENT_LINK_ACTIVE_CLASS : SECONDARY_LINK_ACTIVE_CLASS}
        >
          {link.label}
        </NavLink>
      ))}
      <div className="border-t border-border pt-2 mt-1">{signOutButton}</div>
    </div>
  ) : (
    <GuestActions copy={copy} />
  )

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="relative mx-auto max-w-5xl flex items-center gap-2 px-4 h-14">
        {/* Brand */}
        <Link href="/" className="shrink-0 mr-2" aria-label="ManTur — inicio">
          <ManturLogo size="md" />
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden sm:flex items-center gap-0.5 flex-1">
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-11 flex items-center transition-colors rounded-lg hover:bg-muted/50"
              activeClassName="text-foreground font-semibold bg-muted/40"
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop auth */}
        <div className="hidden sm:flex items-center gap-1 shrink-0 ml-auto">
          {desktopAuthContent}
        </div>

        {/* Mobile: spacer + hamburger */}
        <div className="flex-1 sm:hidden" />
        <div className="sm:hidden">
          <NavMobileMenu links={navLinks}>{mobileAuthContent}</NavMobileMenu>
        </div>
      </div>
    </header>
  )
}

function GuestActions({ copy }: { copy: typeof landingCopy.nav }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
      <Link
        href="/login"
        className="text-sm font-medium text-foreground border border-border px-4 min-h-11 flex items-center justify-center rounded-xl hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-colors"
      >
        {copy.login}
      </Link>
      <Link
        href="/signup"
        className="text-sm font-semibold bg-primary text-primary-foreground px-4 min-h-11 flex items-center justify-center rounded-xl hover:bg-primary/90 transition-colors"
      >
        {copy.signup}
      </Link>
    </div>
  )
}
