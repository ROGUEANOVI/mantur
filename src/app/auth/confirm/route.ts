import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const CONFIRM_ERROR_REDIRECT = '/login?error=confirm'

// This route only handles signup confirmation links. Deliberately excludes
// 'recovery' (and other EmailOtpType values) — this repo has no "set new
// password" page yet, so verifying a recovery token here would leave a user
// fully signed in with their old password still active, defeating password
// reset. Widen this only alongside a dedicated recovery flow.
const ALLOWED_TYPES: EmailOtpType[] = ['signup', 'email']

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

  return NextResponse.redirect(`${origin}${redirectTarget}`)
}
