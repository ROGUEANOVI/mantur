import { Check } from 'lucide-react'
import { authCopy } from '@/lib/copy/auth'
import { PASSWORD_RULES } from '@/lib/password'
import { cn } from '@/lib/utils'

export default function PasswordRequirements({ password }: { password: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold text-foreground">
        {authCopy.signup.passwordRules.title}
      </p>
      <ul className="space-y-1.5">
        {PASSWORD_RULES.map(({ key, label, test }) => {
          const met = test(password)
          return (
            <li key={key} data-met={met} className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-full border',
                  met
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-dashed border-muted-foreground/40',
                )}
              >
                {met && <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className={met ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
