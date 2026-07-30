import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/actions'
import { landingCopy } from '@/lib/copy/landing'

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

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl flex items-center gap-2 px-4 h-14">
        {/* Brand */}
        <Link
          href="/"
          className="text-base font-bold text-primary mr-4 shrink-0 tracking-tight"
        >
          {copy.brand}
        </Link>

        {/* Main links */}
        <nav className="flex items-center gap-0.5 flex-1">
          <Link
            href="/negocios"
            className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center transition-colors rounded-lg hover:bg-muted/50"
          >
            {copy.negocios}
          </Link>
          <Link
            href="/lugares"
            className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center transition-colors rounded-lg hover:bg-muted/50"
          >
            {copy.lugares}
          </Link>
        </nav>

        {/* Auth area */}
        {user ? (
          <div className="flex items-center gap-2 shrink-0">
            {role === 'tourist' && (
              <Link
                href="/mis-reservas"
                className="hidden sm:flex text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] items-center transition-colors rounded-lg hover:bg-muted/50"
              >
                {copy.myBookings}
              </Link>
            )}
            {role === 'business_owner' && (
              <Link
                href="/mi-negocio"
                className="hidden sm:flex text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] items-center transition-colors rounded-lg hover:bg-muted/50"
              >
                {copy.myBusiness}
              </Link>
            )}
            {role === 'admin' && (
              <Link
                href="/admin"
                className="hidden sm:flex text-sm font-medium text-primary px-3 min-h-[44px] items-center transition-colors rounded-lg hover:bg-primary/10"
              >
                {copy.admin}
              </Link>
            )}
            <span className="hidden md:block text-sm text-muted-foreground truncate max-w-[120px]">
              {fullName ?? user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center transition-colors rounded-lg hover:bg-muted/50 whitespace-nowrap"
              >
                {copy.signout}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground px-3 min-h-[44px] flex items-center transition-colors rounded-lg hover:bg-muted/50"
            >
              {copy.login}
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold bg-primary text-primary-foreground px-4 min-h-[40px] flex items-center rounded-xl hover:bg-primary/90 transition-colors"
            >
              {copy.signup}
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
