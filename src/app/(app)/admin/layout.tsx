import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { adminCopy } from '@/lib/copy/admin'

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

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-sm px-4">
        <div className="mx-auto max-w-lg flex items-center gap-1 h-12">
          <Link
            href="/admin"
            className="text-sm font-semibold text-primary mr-3"
          >
            {adminCopy.nav.dashboard}
          </Link>
          <Link
            href="/admin/negocios"
            className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] flex items-center px-2 transition-colors"
          >
            {adminCopy.nav.negocios}
          </Link>
          <Link
            href="/admin/comisiones"
            className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] flex items-center px-2 transition-colors"
          >
            {adminCopy.nav.comisiones}
          </Link>
          <div className="ml-auto">
            <Link
              href="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
