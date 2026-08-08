import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { jsonLdScriptProps } from '@/lib/seo/jsonLd'

const APP_URL = 'https://mantur.co'

export type BreadcrumbItem = { label: string; href?: string }

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: `${APP_URL}${item.href}` } : {}),
    })),
  }

  return (
    <>
      <script {...jsonLdScriptProps(jsonLd)} />
      <nav aria-label="Breadcrumb" className="px-4 py-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {items.map((item, i) => (
            <li key={item.label} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              {item.href ? (
                <Link href={item.href} className="font-medium hover:text-primary hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="font-semibold text-foreground" aria-current="page">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}
