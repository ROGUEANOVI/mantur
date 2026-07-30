import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/*
 * This layout guards every route in the (app) group.
 * If the user has no active Supabase session they are redirected to /login
 * before any child page renders — no flash of protected content.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <>{children}</>
}
