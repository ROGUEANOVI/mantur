'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { transportCopy } from '@/lib/copy/transport'

type ActionResult = { error: string } | void

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getAuthenticatedTourist() {
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

  if (profile?.role !== 'tourist') redirect('/')

  return { supabase, userId: user.id }
}

export async function createTransportRequest(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedTourist()

  const origin = (formData.get('origin') as string)?.trim()
  const destination = (formData.get('destination') as string)?.trim()
  const rawDatetime = (formData.get('requested_datetime') as string)?.trim()
  const rawPeople = formData.get('people_count') as string
  const notes = (formData.get('notes') as string)?.trim() || null

  const copy = transportCopy.errors

  if (!origin || !destination || !rawDatetime) return { error: copy.missingFields }

  const requestedDatetime = new Date(rawDatetime)
  if (isNaN(requestedDatetime.getTime()) || requestedDatetime <= new Date()) {
    return { error: copy.invalidDatetime }
  }

  const peopleCount = parseInt(rawPeople, 10)
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    return { error: copy.missingFields }
  }

  const { error } = await supabase.from('transport_requests').insert({
    tourist_id: userId,
    origin,
    destination,
    requested_datetime: requestedDatetime.toISOString(),
    people_count: peopleCount,
    notes,
  })

  if (error) return { error: copy.generic }

  revalidatePath('/mis-viajes')
  redirect('/mis-viajes')
}

export async function cancelTransportRequest(formData: FormData): Promise<void> {
  const { supabase } = await getAuthenticatedTourist()

  const requestId = formData.get('requestId') as string
  if (!UUID_RE.test(requestId)) redirect('/mis-viajes')

  await supabase
    .from('transport_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('status', 'pending')

  revalidatePath('/mis-viajes')
}
