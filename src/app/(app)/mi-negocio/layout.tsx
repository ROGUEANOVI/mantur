import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/*
 * Guards every route under /mi-negocio.
 * Requires an authenticated session AND the business_owner role.
 * Other roles (tourist, transporter) are redirected to the app home.
 */
export default async function MiNegocioLayout({
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

  if (profile?.role !== 'business_owner') redirect('/')

  return <>{children}</>
}
