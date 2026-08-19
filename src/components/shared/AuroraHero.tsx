/**
 * Organic "aurora" hero background for the grid listing pages (negocios,
 * lugares): three blurred brand-color blobs over a dark base. Built from
 * blurred solid shapes rather than layered radial-gradient stops — at
 * real hero widths, stacked radial-gradients with hard opacity cutoffs
 * produce visible concentric rings ("banding"); a blur has no such edge.
 */
export default function AuroraHero({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-[#0a2b1e] text-center px-4 pt-10 pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-16 size-64 sm:size-[26rem] rounded-full bg-accent/70 blur-[90px] sm:blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-20 size-56 sm:size-[22rem] rounded-full bg-[#5ba88a]/60 blur-[90px] sm:blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-1/4 size-72 sm:size-[28rem] rounded-full bg-primary blur-[90px] sm:blur-[110px]"
      />
      <div className="relative max-w-2xl mx-auto">{children}</div>
    </section>
  )
}
