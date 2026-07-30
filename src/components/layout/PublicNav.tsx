import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/actions'
import { landingCopy } from '@/lib/copy/landing'
import NavMobileMenu from './NavMobileMenu'

export default async function PublicNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let role: string | null = null
  let fullName: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null
    fullName = profile?.full_name ?? null
  }

  const copy = landingCopy.nav

  const navLinks = [
    { label: copy.negocios, href: '/negocios' },
    { label: copy.lugares, href: '/lugares' },
  ]

  // Auth section — same markup reused in both desktop + mobile drawer
  const authContent = user ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1">
      {role === 'tourist' && (
        <Link
          href="/mis-reservas"
          className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center rounded-lg hover:bg-muted/50 transition-colors"
        >
          {copy.myBookings}
        </Link>
      )}
      {role === 'business_owner' && (
        <Link
          href="/mi-negocio"
          className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center rounded-lg hover:bg-muted/50 transition-colors"
        >
          {copy.myBusiness}
        </Link>
      )}
      {role === 'admin' && (
        <Link
          href="/admin"
          className="text-sm font-medium text-primary px-3 min-h-[44px] flex items-center rounded-lg hover:bg-primary/10 transition-colors"
        >
          {copy.admin}
        </Link>
      )}
      <span className="hidden md:block text-sm text-muted-foreground px-2 truncate max-w-[140px]">
        {fullName ?? user.email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center rounded-lg hover:bg-muted/50 transition-colors whitespace-nowrap"
        >
          {copy.signout}
        </button>
      </form>
    </div>
  ) : (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
      <Link
        href="/login"
        className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center rounded-lg hover:bg-muted/50 transition-colors"
      >
        {copy.login}
      </Link>
      <Link
        href="/signup"
        className="text-sm font-semibold bg-primary text-primary-foreground px-4 min-h-[44px] flex items-center justify-center rounded-xl hover:bg-primary/90 transition-colors"
      >
        {copy.signup}
      </Link>
    </div>
  )

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="relative mx-auto max-w-5xl flex items-center gap-2 px-4 h-14">
        {/* Brand */}
        <Link
          href="/"
          className="text-base font-bold text-primary shrink-0 tracking-tight mr-2"
        >
          {copy.brand}
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden sm:flex items-center gap-0.5 flex-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center transition-colors rounded-lg hover:bg-muted/50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth */}
        <div className="hidden sm:flex items-center gap-1 shrink-0 ml-auto">
          {authContent}
        </div>

        {/* Mobile: spacer + hamburger */}
        <div className="flex-1 sm:hidden" />
        <div className="sm:hidden">
          <NavMobileMenu links={navLinks}>{authContent}</NavMobileMenu>
        </div>
      </div>
    </header>
  )
}
