import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const CONFIRM_ERROR_REDIRECT = '/login?error=confirm'

// 'recovery' is allowed alongside signup confirmation links — see the
// type === 'recovery' branch below, which sends it to the dedicated
// "set new password" page instead of the generic redirect.
const ALLOWED_TYPES: EmailOtpType[] = ['signup', 'email', 'recovery']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')
  // Only allow same-origin relative paths — reject absolute/protocol-relative
  // URLs (e.g. "//evil.com") to avoid an open redirect via the `next` param.
  // Safety depends on always prefixing the trusted `origin` below and never
  // calling redirect() with `next` alone — don't "simplify" that away.
  const redirectTarget = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!tokenHash || !type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}${CONFIRM_ERROR_REDIRECT}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    return NextResponse.redirect(`${origin}${CONFIRM_ERROR_REDIRECT}`)
  }

  // Recovery always lands on the set-new-password page — hardcoded rather
  // than trusting `next`, since there's exactly one legitimate destination
  // for a recovery link.
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/restablecer-password`)
  }

  return NextResponse.redirect(`${origin}${redirectTarget}`)
}
