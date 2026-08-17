'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { roleRequestsCopy } from '@/lib/copy/roleRequests'
import { roleRequestRateLimit, checkRateLimit } from '@/lib/rate-limit'
import { normalizeColombianPhone } from '@/lib/phone'

type ActionResult = { error?: string; success?: boolean }

const REQUESTABLE_ROLES = ['business_owner', 'transporter', 'tourist_guide'] as const
type RequestableRole = (typeof REQUESTABLE_ROLES)[number]

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

export async function submitRoleRequest(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getAuthenticatedUser()
  const copy = roleRequestsCopy.errors

  const allowed = await checkRateLimit(roleRequestRateLimit, user.id)
  if (!allowed) return { error: copy.rateLimited }

  const rawRole = formData.get('requested_role') as string
  if (!(REQUESTABLE_ROLES as readonly string[]).includes(rawRole)) {
    return { error: copy.missingFields }
  }
  const requestedRole = rawRole as RequestableRole

  // Check current role — can't request what you already have
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === requestedRole) return { error: copy.alreadyHasRole }

  // Check for an existing pending request for this role
  const { data: existing } = await supabase
    .from('role_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('requested_role', requestedRole)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return { error: copy.alreadyPending }

  // Build role-specific metadata
  let metadata: Record<string, unknown> = {}

  if (requestedRole === 'business_owner') {
    const businessName = (formData.get('business_name') as string | null)?.trim()
    const categorySlugs = formData.getAll('category_slugs') as string[]
    const rawPhone = (formData.get('phone') as string | null)?.trim()
    if (!businessName || !categorySlugs.length || !rawPhone) return { error: copy.missingFields }
    const phone = normalizeColombianPhone(rawPhone)
    if (!phone) return { error: copy.invalidPhone }

    const rawLat = (formData.get('lat') as string | null) ?? ''
    const rawLng = (formData.get('lng') as string | null) ?? ''
    const lat = rawLat ? Number(rawLat) : null
    const lng = rawLng ? Number(rawLng) : null
    if ((rawLat && !Number.isFinite(lat)) || (rawLng && !Number.isFinite(lng))) {
      return { error: copy.invalidCoords }
    }

    metadata = { business_name: businessName, category_slugs: categorySlugs, phone, lat, lng }
  }

  if (requestedRole === 'transporter') {
    const licensePlate = (formData.get('license_plate') as string | null)?.trim().toUpperCase()
    const vehicleType = (formData.get('vehicle_type') as string | null)?.trim()
    const rawPhone = (formData.get('phone') as string | null)?.trim()
    if (!licensePlate || !vehicleType || !rawPhone) return { error: copy.missingFields }
    const phone = normalizeColombianPhone(rawPhone)
    if (!phone) return { error: copy.invalidPhone }
    metadata = { license_plate: licensePlate, vehicle_type: vehicleType, phone }
  }

  if (requestedRole === 'tourist_guide') {
    const specialties = formData.getAll('specialties') as string[]
    const languages = formData.getAll('languages') as string[]
    const experienceYears = parseInt(formData.get('experience_years') as string, 10)
    const bio = (formData.get('bio') as string | null)?.trim()
    const rawPhone = (formData.get('phone') as string | null)?.trim()
    if (!specialties.length || !languages.length || !Number.isFinite(experienceYears) || !bio || !rawPhone) {
      return { error: copy.missingFields }
    }
    const phone = normalizeColombianPhone(rawPhone)
    if (!phone) return { error: copy.invalidPhone }
    metadata = { specialties, languages, experience_years: experienceYears, bio, phone }
  }

  const notes = (formData.get('notes') as string | null)?.trim() || null

  const { error } = await supabase.from('role_requests').insert({
    user_id: user.id,
    requested_role: requestedRole,
    metadata,
    notes,
  })

  if (error) return { error: copy.generic }

  revalidatePath('/solicitar-rol')
  return { success: true }
}
