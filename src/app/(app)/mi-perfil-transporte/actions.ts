'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { transportCopy } from '@/lib/copy/transport'

type ActionResult = { error: string } | void


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthenticatedTransporter() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'transporter') redirect('/')

  const { data: transporter } = await supabase
    .from('transporters')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!transporter) redirect('/')

  return { supabase, userId: user.id, transporterId: transporter.id }
}

export async function toggleAvailability(): Promise<ActionResult> {
  const { supabase, transporterId } = await getAuthenticatedTransporter()

  const { data: current } = await supabase
    .from('transporters')
    .select('is_available')
    .eq('id', transporterId)
    .single()

  if (!current) return { error: transportCopy.errors.generic }

  const { error } = await supabase
    .from('transporters')
    .update({ is_available: !current.is_available })
    .eq('id', transporterId)

  if (error) return { error: transportCopy.errors.generic }

  revalidatePath('/mi-perfil-transporte')
  revalidatePath('/transportistas')
}

export async function acceptTransportRequest(formData: FormData): Promise<void> {
  const { transporterId } = await getAuthenticatedTransporter()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) return

  const admin = createAdminClient()

  // Atomic claim: only succeeds if the request is still pending.
  // Postgres UPDATE is row-level atomic so only one transporter wins the race.
  // If data is empty, the request was already accepted — revalidate silently
  // so the transporter sees the updated list without the claimed request.
  await admin
    .from('transport_requests')
    .update({ transporter_id: transporterId, status: 'accepted' })
    .eq('id', requestId)
    .eq('status', 'pending')

  revalidatePath('/mi-perfil-transporte')
}

export async function markCompleted(formData: FormData): Promise<void> {
  const { transporterId } = await getAuthenticatedTransporter()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) return

  const admin = createAdminClient()

  await admin
    .from('transport_requests')
    .update({ status: 'completed' })
    .eq('id', requestId)
    .eq('transporter_id', transporterId)
    .eq('status', 'accepted')

  revalidatePath('/mi-perfil-transporte')
}
