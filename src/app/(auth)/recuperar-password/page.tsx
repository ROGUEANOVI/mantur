import Link from 'next/link'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'
import AuthCard from '@/components/auth/AuthCard'
import AuthFooter from '@/components/auth/AuthFooter'
import { authCopy } from '@/lib/copy/auth'

export const metadata = {
  title: 'Recuperar contraseña — ManTur',
  robots: { index: false, follow: true },
}

export default async function RecuperarPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const authError = error === 'expired' ? 'expired' : undefined

  return (
    <>
      <AuthCard>
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-foreground">
              {authCopy.forgotPassword.title}
            </h1>
            <p className="text-sm text-muted-foreground">{authCopy.forgotPassword.subtitle}</p>
          </div>

          <ForgotPasswordForm authError={authError} />
        </div>
      </AuthCard>

      <AuthFooter>
        <p>
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {authCopy.forgotPassword.backToLogin}
          </Link>
        </p>
      </AuthFooter>
    </>
  )
}
