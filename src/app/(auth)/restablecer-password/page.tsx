import { redirect } from 'next/navigation'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'
import AuthCard from '@/components/auth/AuthCard'
import { authCopy } from '@/lib/copy/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Restablecer contraseña — ManTur',
  robots: { index: false, follow: true },
}

export default async function RestablecerPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Only reachable with the temporary session verifyOtp({type:'recovery'})
  // creates after the user clicks the email link — no session means the
  // link is missing, invalid, or already expired.
  if (!user) redirect('/recuperar-password?error=expired')

  return (
    <AuthCard>
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            {authCopy.resetPassword.title}
          </h1>
          <p className="text-sm text-muted-foreground">{authCopy.resetPassword.subtitle}</p>
        </div>

        <ResetPasswordForm />
      </div>
    </AuthCard>
  )
}
