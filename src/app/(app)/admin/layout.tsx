import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/layout/PublicNav'
import AdminSidebar from '@/components/layout/AdminSidebar'
import AdminMobileMenu from '@/components/layout/AdminMobileMenu'

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
          {/* Mobile menu — visible below lg, opens the same vertical, grouped nav as the desktop sidebar */}
          <AdminMobileMenu />

          {/* Page content */}
          {children}
        </div>
      </div>
    </div>
  )
}
