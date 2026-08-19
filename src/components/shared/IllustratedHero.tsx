import { cn } from '@/lib/utils'

/**
 * Hero for list-profile pages (Transportadores, Guías): title/subtitle
 * centered across the full hero width — matching AuroraHero on the grid
 * pages — with the illustration as a full-width band underneath, not a
 * side column. A side-by-side split only centers text within half the
 * hero, which reads off-center against the page as a whole.
 */
export default function IllustratedHero({
  title,
  subtitle,
  stat,
  illustration,
  className,
  textClassName,
  panelClassName,
}: {
  title: string
  subtitle: string
  stat?: React.ReactNode
  illustration: React.ReactNode
  /** Background for the whole hero (amber for transportadores, green for guías). */
  className: string
  /** Text color utilities for the title/subtitle block. */
  textClassName: string
  /** Background for the illustration band beneath the text. */
  panelClassName: string
}) {
  return (
    <section className={cn('relative overflow-hidden', className)}>
      <div className={cn('relative px-4 pt-10 pb-6 text-center max-w-2xl mx-auto', textClassName)}>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm opacity-80">{subtitle}</p>
        {stat && <div className="mt-4 flex justify-center">{stat}</div>}
      </div>
      <div className={cn('relative h-40 sm:h-48', panelClassName)}>{illustration}</div>
    </section>
  )
}
