'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type FavoriteEntityType = 'business' | 'place'
type ActionResult = { favorited: boolean } | { error: string }

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return { supabase, userId: user.id }
}

// Toggle rather than set/unset — the client only ever knows the last state it
// rendered, so "flip whatever the row currently says" avoids a lost-update
// race between two tabs toggling the same favorite.
export async function toggleFavorite(
  entityType: FavoriteEntityType,
  entityId: string,
): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedUser()

  const { data: existing } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase.from('favorites').delete().eq('id', existing.id)
    if (error) return { error: error.message }
    return { favorited: false }
  }

  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, entity_type: entityType, entity_id: entityId })

  if (error) return { error: error.message }
  return { favorited: true }
}
