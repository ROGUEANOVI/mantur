'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'

type ActionResult = { error?: string; success?: boolean }

const VALID_PRICING_UNITS = new Set(['per_person', 'per_night', 'fixed'])

async function getAuthenticatedAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/')
  return createAdminClient()
}

export async function createServiceType(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.tiposServicio

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  if (!name) return { error: copy.errors.nameRequired }

  const pricingUnit = formData.get('pricing_unit') as string | null
  if (!pricingUnit || !VALID_PRICING_UNITS.has(pricingUnit)) {
    return { error: copy.errors.pricingUnitRequired }
  }

  // Auto-generate slug from name: "Casa de campo" → "casa_de_campo"
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 50)

  // Reserved words that would break a plain-object property lookup
  // (SERVICE_TYPE_ATTRIBUTE_FIELDS[slug] in src/lib/services/attributeConfig.ts).
  if (!slug || ['__proto__', 'constructor', 'prototype'].includes(slug)) {
    return { error: copy.errors.nameRequired }
  }

  // Place new type at the end of the list
  const { data: maxRow } = await admin
    .from('service_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sortOrder = ((maxRow?.sort_order as number | null) ?? 0) + 1

  const { error } = await admin
    .from('service_types')
    .insert({ name, slug, pricing_unit: pricingUnit, sort_order: sortOrder })

  if (error) {
    if (error.code === '23505') return { error: copy.errors.slugTaken }
    return { error: copy.errors.generic }
  }

  revalidatePath('/admin/tipos-servicio')
  return { success: true }
}

export async function toggleServiceTypeActive(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const id = formData.get('id') as string | null
  const isActive = formData.get('is_active') === 'true'

  if (!id) return

  await admin
    .from('service_types')
    .update({ is_active: !isActive })
    .eq('id', id)

  revalidatePath('/admin/tipos-servicio')
}
