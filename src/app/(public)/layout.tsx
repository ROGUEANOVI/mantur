import PublicNav from '@/components/layout/PublicNav'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <PublicNav />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          © 2026 VayaTur. Tu guía de turismo en Manaure Balcón del Cesar, Colombia.
        </p>
      </footer>
    </div>
  )
}
