import { MapPin } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'

/*
 * Authenticated home — placeholder for the tourist dashboard.
 * This page will be replaced with the full listing/discovery UI in a
 * future iteration; for now it confirms auth works and provides a
 * sign-out escape hatch.
 */
export default function AppHomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-background">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        {/* Decorative icon */}
        <MapPin
          className="size-20 text-primary opacity-90"
          aria-hidden="true"
          strokeWidth={1.5}
        />

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Explora Manaure
          </h1>
          <p className="text-base text-muted-foreground">
            Próximamente: balnearios, fincas, experiencias y más
          </p>
        </div>

        {/* Sign-out — plain form so it triggers a Server Action without JS */}
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  )
}
