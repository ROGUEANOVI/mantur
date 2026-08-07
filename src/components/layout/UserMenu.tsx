'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'
import { landingCopy } from '@/lib/copy/landing'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export type UserMenuLink = {
  label: string
  href: string
  accent?: boolean
}

/**
 * Avatar-triggered dropdown grouping the secondary account links for an
 * authenticated user (everything that isn't the one primary role link kept
 * inline in the desktop nav). Desktop-only — the mobile drawer renders the
 * same set of links as flat rows instead (see PublicNav.tsx).
 */
export default function UserMenu({
  fullName,
  email,
  role,
  links,
}: {
  fullName: string | null
  email: string | null
  role: string | null
  links: UserMenuLink[]
}) {
  const copy = landingCopy.nav
  const displayName = fullName ?? email ?? ''
  const initials = getInitials(displayName)
  const roleLabel = role ? copy.roleLabels[role as keyof typeof copy.roleLabels] : undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex items-center gap-2 px-2 min-h-[44px] rounded-lg text-sm text-foreground hover:bg-muted/50 transition-colors">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none"
          aria-hidden="true"
          title={displayName}
        >
          {initials || '?'}
        </span>
        <span className="max-w-40 truncate font-medium">{displayName}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-popup-open:rotate-180"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate font-medium text-foreground">{displayName}</span>
            {roleLabel && <span className="block text-xs font-normal text-muted-foreground">{roleLabel}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {links.map((link) => (
          <Fragment key={link.href}>
            <DropdownMenuItem
              render={<Link href={link.href} />}
              className={cn(link.accent && 'text-accent focus:bg-accent/10 focus:text-accent')}
            >
              {link.label}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </Fragment>
        ))}
        <DropdownMenuItem render={<form action={signOut} className="w-full" />}>
          <button type="submit" className="w-full cursor-default text-left">
            {copy.signout}
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
