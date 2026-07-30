import LoginForm from '@/components/auth/LoginForm'
import { authCopy } from '@/lib/copy/auth'

export const metadata = {
  title: 'Iniciar sesión — VayaTur',
}

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-foreground">
          {authCopy.login.title}
        </h1>
        <p className="text-sm text-muted-foreground">{authCopy.login.subtitle}</p>
      </div>

      <LoginForm />
    </div>
  )
}
