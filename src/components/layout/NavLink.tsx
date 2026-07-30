'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function NavLink({
  href,
  children,
  exact = false,
  className,
  activeClassName,
}: {
  href: string
  children: React.ReactNode
  exact?: boolean
  className?: string
  activeClassName?: string
}) {
  const pathname = usePathname()
  const isActive = exact ? pathname === href : pathname.startsWith(href)

  return (
    <Link href={href} className={cn(className, isActive && activeClassName)}>
      {children}
    </Link>
  )
}
