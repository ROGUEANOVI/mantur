/**
 * Floating white card that overlaps the bottom edge of a hero section —
 * the repeated element that ties Explorar/Lugares/Transportadores/Guías
 * together as one system even though the hero above it differs per page.
 */
export default function HeroControlCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 -mt-8 px-4">
      <div className="max-w-3xl mx-auto rounded-3xl bg-card border border-border shadow-xl p-4">
        {children}
      </div>
    </div>
  )
}
