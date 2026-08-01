import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/layout/PublicNav'

export default async function MisViajesLayout({
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

  // Transporters have their own panel; redirect them there.
  if (profile?.role === 'transporter') redirect('/mi-perfil-transporte')

  return (
    <>
      <PublicNav />
      {children}
    </>
  )
}
