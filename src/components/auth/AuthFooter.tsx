// Lives on the dark shell background (outside AuthCard), not on the card
// itself — links must use the amber accent color for contrast, never
// text-primary/text-muted-foreground (those are tuned for the light card).
export default function AuthFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 text-center text-sm text-white/70 space-y-2">
      {children}
    </div>
  )
}
