import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { adminCopy } from '@/lib/copy/admin'
import NavLink from '@/components/layout/NavLink'
import PublicNav from '@/components/layout/PublicNav'
import AdminSidebar from '@/components/layout/AdminSidebar'

const NAV_ITEMS = [
  { href: '/admin',               label: adminCopy.nav.dashboard,   exact: true  },
  { href: '/admin/solicitudes',   label: adminCopy.nav.solicitudes, exact: false },
  { href: '/admin/negocios',      label: adminCopy.nav.negocios,    exact: false },
  { href: '/admin/lugares',       label: adminCopy.nav.lugares,     exact: false },
  { href: '/admin/comisiones',    label: adminCopy.nav.comisiones,  exact: false },
  { href: '/admin/categorias',    label: adminCopy.nav.categorias,  exact: false },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/')

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav — same as public pages */}
      <PublicNav />

      <div className="flex">
        {/* Left sidebar — desktop (lg+), fixed positioned, collapsible */}
        <AdminSidebar />

        {/* Content — ml-14 on desktop offsets the collapsed sidebar (w-14); sidebar is fixed so it never shifts this */}
        <div className="flex-1 min-w-0 flex flex-col lg:ml-14">
          {/* Mobile tab bar — visible below lg */}
          <div className="lg:hidden sticky top-14 z-10 border-b border-border bg-card/90 backdrop-blur-sm">
            <div className="flex overflow-x-auto scrollbar-none h-11 items-stretch px-2">
              {NAV_ITEMS.map(({ href, label, exact }) => (
                <NavLink
                  key={href}
                  href={href}
                  exact={exact}
                  className="shrink-0 text-sm text-muted-foreground px-3 flex items-center border-b-2 border-transparent hover:text-foreground transition-colors whitespace-nowrap"
                  activeClassName="text-foreground font-semibold border-primary"
                >
                  {label}
                </NavLink>
              ))}
            </div>
          </div>

          {/* Page content */}
          {children}
        </div>
      </div>
    </div>
  )
}
