import Link from 'next/link'
import SignupForm from '@/components/auth/SignupForm'
import AuthCard from '@/components/auth/AuthCard'
import AuthFooter from '@/components/auth/AuthFooter'
import { authCopy } from '@/lib/copy/auth'

export const metadata = {
  title: 'Crear cuenta — ManTur',
  robots: { index: false, follow: true },
}

export default function SignupPage() {
  const legal = authCopy.signup.legalConsent

  return (
    <>
      <AuthCard>
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-foreground">
              {authCopy.signup.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {authCopy.signup.subtitle}
            </p>
          </div>

          <SignupForm />
        </div>
      </AuthCard>

      <AuthFooter>
        <p>
          {authCopy.signup.hasAccount}{' '}
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            {authCopy.signup.loginLink}
          </Link>
        </p>
        <p className="text-xs text-white/50">
          {legal.prefix}
          <Link
            href="/terminos-y-condiciones"
            className="text-accent underline-offset-4 hover:underline"
          >
            {legal.terms}
          </Link>
          {legal.middle}
          <Link
            href="/politica-de-privacidad"
            className="text-accent underline-offset-4 hover:underline"
          >
            {legal.privacy}
          </Link>
          {legal.suffix}
        </p>
      </AuthFooter>
    </>
  )
}
