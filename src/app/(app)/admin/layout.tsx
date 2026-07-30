import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { adminCopy } from '@/lib/copy/admin'
import NavLink from '@/components/layout/NavLink'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  const linkBase =
    'text-sm min-h-[44px] flex items-center px-2 transition-colors rounded-lg'
  const inactive = 'text-muted-foreground hover:text-foreground'
  const active = 'text-foreground font-semibold'

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm px-4">
        <div className="mx-auto max-w-lg flex items-center gap-0.5 h-12">
          <NavLink
            href="/admin"
            exact
            className={`text-sm font-bold text-primary mr-2 px-2 min-h-[44px] flex items-center`}
            activeClassName="underline underline-offset-4"
          >
            {adminCopy.nav.dashboard}
          </NavLink>
          <NavLink
            href="/admin/negocios"
            className={`${linkBase} ${inactive}`}
            activeClassName={active}
          >
            {adminCopy.nav.negocios}
          </NavLink>
          <NavLink
            href="/admin/lugares"
            className={`${linkBase} ${inactive}`}
            activeClassName={active}
          >
            {adminCopy.nav.lugares}
          </NavLink>
          <NavLink
            href="/admin/comisiones"
            className={`${linkBase} ${inactive}`}
            activeClassName={active}
          >
            {adminCopy.nav.comisiones}
          </NavLink>
          <div className="ml-auto">
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2"
            >
              ← App
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  )
}
