'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ActionResult = { error: string } | void

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePrice(raw: string): number | null {
  const price = parseFloat(raw)
  // isNaN catches NaN; Number.isFinite rejects Infinity/-Infinity
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return null
  return price
}

function parsePositiveInt(raw: string | null): number | null | false {
  if (!raw) return null
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) return false
  return n
}

async function getAuthenticatedOwner() {
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

  if (profile?.role !== 'business_owner') redirect('/')

  return { supabase, userId: user.id }
}

export async function createBusiness(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedOwner()

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const type = formData.get('type') as string
  const address = (formData.get('address') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  const validTypes = ['resort', 'restaurant', 'farm', 'eatery', 'other']
  if (!name || !validTypes.includes(type)) {
    return { error: 'Datos inválidos. Verifica el nombre y el tipo de negocio.' }
  }

  const { error } = await supabase.from('businesses').insert({
    owner_id: userId,
    name,
    description,
    type,
    address,
    phone,
    verified: false,
    status: 'pending',
  })

  if (error) return { error: 'No se pudo crear el negocio. Intenta de nuevo.' }

  revalidatePath('/mi-negocio')
  redirect('/mi-negocio')
}

export async function updateBusiness(
  businessId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }

  const { supabase, userId } = await getAuthenticatedOwner()

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const type = formData.get('type') as string
  const address = (formData.get('address') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  const validTypes = ['resort', 'restaurant', 'farm', 'eatery', 'other']
  if (!name || !validTypes.includes(type)) {
    return { error: 'Datos inválidos. Verifica el nombre y el tipo de negocio.' }
  }

  const { error } = await supabase
    .from('businesses')
    .update({ name, description, type, address, phone })
    .eq('id', businessId)
    .eq('owner_id', userId)

  if (error) return { error: 'No se pudo actualizar el negocio. Intenta de nuevo.' }

  revalidatePath('/mi-negocio')
}

export async function createExperience(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await getAuthenticatedOwner()

  const businessId = formData.get('business_id') as string
  if (!UUID_RE.test(businessId)) return { error: 'Negocio no encontrado.' }

  // Verify the business belongs to this owner before inserting
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('owner_id', userId)
    .single()

  if (!business) return { error: 'Negocio no encontrado.' }

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null

  // Price is parsed and validated server-side — never trust the raw client value.
  // parsePrice rejects NaN, Infinity, negatives, and unreasonable amounts.
  const price = parsePrice(formData.get('price') as string)
  if (!name || price === null) {
    return { error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' }
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string | null)
  if (capacity === false) return { error: 'El cupo debe ser un número positivo.' }

  const duration_minutes = parsePositiveInt(formData.get('duration_minutes') as string | null)
  if (duration_minutes === false) return { error: 'La duración debe ser un número positivo.' }

  const { error } = await supabase.from('experiences').insert({
    business_id: businessId,
    name,
    description,
    price,
    capacity,
    duration_minutes,
    status: 'active',
  })

  if (error) return { error: 'No se pudo crear la experiencia. Intenta de nuevo.' }

  revalidatePath('/mi-negocio/experiencias')
  redirect('/mi-negocio/experiencias')
}

export async function updateExperience(
  experienceId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!UUID_RE.test(experienceId)) return { error: 'Experiencia no encontrada.' }

  const { supabase } = await getAuthenticatedOwner()

  const name = (formData.get('name') as string).trim()
  const description = (formData.get('description') as string | null)?.trim() || null

  const price = parsePrice(formData.get('price') as string)
  if (!name || price === null) {
    return { error: 'Nombre y precio son requeridos. El precio no puede ser negativo.' }
  }

  const capacity = parsePositiveInt(formData.get('capacity') as string | null)
  if (capacity === false) return { error: 'El cupo debe ser un número positivo.' }

  const duration_minutes = parsePositiveInt(formData.get('duration_minutes') as string | null)
  if (duration_minutes === false) return { error: 'La duración debe ser un número positivo.' }

  // RLS UPDATE policy verifies ownership via the businesses table.
  // .select('id') forces PostgREST to return the modified row so we can
  // detect a silent RLS block (0 rows updated) vs a real error.
  const { data, error } = await supabase
    .from('experiences')
    .update({ name, description, price, capacity, duration_minutes })
    .eq('id', experienceId)
    .select('id')

  if (error || !data?.length) {
    return { error: 'No se pudo actualizar la experiencia. Intenta de nuevo.' }
  }

  revalidatePath('/mi-negocio/experiencias')
}

export async function toggleExperienceStatus(
  experienceId: string,
  currentStatus: 'active' | 'inactive',
): Promise<ActionResult> {
  if (!UUID_RE.test(experienceId)) return { error: 'Experiencia no encontrada.' }

  const { supabase } = await getAuthenticatedOwner()

  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'

  // .select('id') detects silent RLS blocks (0 rows updated)
  const { data, error } = await supabase
    .from('experiences')
    .update({ status: newStatus })
    .eq('id', experienceId)
    .select('id')

  if (error || !data?.length) {
    return { error: 'No se pudo actualizar el estado. Intenta de nuevo.' }
  }

  revalidatePath('/mi-negocio/experiencias')
}
