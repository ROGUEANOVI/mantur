import Link from 'next/link'
import Image from 'next/image'
import { Package } from 'lucide-react'

export type PackageCardRow = {
  id: string
  slug: string
  name: string
  description: string | null
  base_price: number | string
  images: string[] | null
}

export default function PackageCard({ pkg }: { pkg: PackageCardRow }) {
  const imageUrl = pkg.images?.[0]

  return (
    <div className="group relative h-full rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 has-[a:active]:scale-[0.98] transition-all">
      <Link
        href={`/paquetes/${pkg.slug}`}
        className="absolute inset-0 z-0"
        aria-label={pkg.name}
      >
        <span className="sr-only">{pkg.name}</span>
      </Link>

      <div className="relative aspect-[4/3] pointer-events-none">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={pkg.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-primary/30 flex items-center justify-center">
            <Package className="size-12 text-primary/60" aria-hidden="true" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="relative z-10 p-4 space-y-1.5 pointer-events-none">
        <h3 className="font-semibold text-foreground text-base leading-snug line-clamp-1">
          {pkg.name}
        </h3>
        {pkg.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {pkg.description}
          </p>
        )}
        <p className="text-base font-semibold text-accent">
          ${Number(pkg.base_price).toLocaleString('es-CO')} COP
        </p>
      </div>
    </div>
  )
}
