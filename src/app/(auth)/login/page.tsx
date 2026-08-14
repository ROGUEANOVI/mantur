import LoginForm from '@/components/auth/LoginForm'
import { authCopy } from '@/lib/copy/auth'

export const metadata = {
  title: 'Iniciar sesión — ManTur',
  robots: { index: false, follow: true },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          {authCopy.login.title}
        </h1>
        <p className="text-sm text-muted-foreground">{authCopy.login.subtitle}</p>
      </div>

      <LoginForm oauthError={error === 'oauth'} />
    </div>
  )
}
