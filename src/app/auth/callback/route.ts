import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const OAUTH_ERROR_REDIRECT = '/login?error=oauth'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error')

  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}${OAUTH_ERROR_REDIRECT}`)
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    return NextResponse.redirect(`${origin}${OAUTH_ERROR_REDIRECT}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}${OAUTH_ERROR_REDIRECT}`)
  }

  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .from('profiles')
    .select('role, full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  // Never default to 'tourist' when the read itself failed — that would
  // silently downgrade a returning admin/business_owner on transient errors.
  if (readError) {
    return NextResponse.redirect(`${origin}${OAUTH_ERROR_REDIRECT}`)
  }

  const meta = user.user_metadata ?? {}
  const googleFullName = (meta.full_name ?? meta.name ?? null) as string | null
  const googleAvatarUrl = (meta.avatar_url ?? meta.picture ?? null) as string | null

  if (existing) {
    // Never rewrite `role` for an existing profile: this keeps the
    // read-then-write non-authoritative for role, so it can't clobber a
    // concurrent role change (e.g. an admin approval) with a stale read.
    await admin
      .from('profiles')
      .update({
        full_name: existing.full_name ?? googleFullName,
        avatar_url: existing.avatar_url ?? googleAvatarUrl,
      })
      .eq('id', user.id)
  } else {
    await admin.from('profiles').upsert(
      { id: user.id, role: 'tourist', full_name: googleFullName, avatar_url: googleAvatarUrl },
      { onConflict: 'id' },
    )
  }

  const role = existing?.role ?? 'tourist'
  return NextResponse.redirect(`${origin}${role === 'admin' ? '/admin' : '/'}`)
}
