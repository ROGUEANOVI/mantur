import SignupForm from '@/components/auth/SignupForm'
import { authCopy } from '@/lib/copy/auth'

export const metadata = {
  title: 'Crear cuenta — ManTur',
}

export default function SignupPage() {
  return (
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
  )
}
