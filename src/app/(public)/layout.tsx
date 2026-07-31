import PublicNav from '@/components/layout/PublicNav'
import { landingCopy } from '@/lib/copy/landing'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { footer } = landingCopy
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border px-4 py-8 text-center space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{footer.tagline}</p>
        <p className="text-xs text-muted-foreground/60">{footer.rights}</p>
      </footer>
    </div>
  )
}
