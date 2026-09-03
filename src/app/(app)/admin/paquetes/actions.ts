'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/validation'

type ActionResult = { error: string } | { success: true }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRICING_UNITS = new Set(['per_person', 'per_night', 'fixed'])

async function getAuthenticatedAdmin() {
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

  if (profile?.role !== 'admin') redirect('/')

  return createAdminClient()
}

type ParsedPackageFields = {
  name: string
  description: string | null
  base_price: number
  pricing_unit: string
  capacity: number | null
}

function parsePackageFields(
  formData: FormData,
): { error: string } | { fields: ParsedPackageFields } {
  const copy = adminCopy.paquetes.errors

  const name = ((formData.get('name') as string | null) ?? '').trim()
  if (!name) return { error: copy.nameRequired }

  const description = (formData.get('description') as string | null)?.trim() || null
  if (description && description.length > DESCRIPTION_MAX_LENGTH) {
    return { error: copy.descriptionTooLong }
  }

  const rawPrice = formData.get('base_price') as string | null
  const basePrice = Number(rawPrice)
  if (!rawPrice || !Number.isFinite(basePrice) || basePrice < 0) {
    return { error: copy.invalidPrice }
  }

  const pricingUnit = formData.get('pricing_unit') as string
  if (!PRICING_UNITS.has(pricingUnit)) return { error: copy.invalidPricingUnit }

  const rawCapacity = formData.get('capacity') as string | null
  let capacity: number | null = null
  if (rawCapacity) {
    capacity = Number(rawCapacity)
    if (!Number.isInteger(capacity) || capacity <= 0) return { error: copy.invalidCapacity }
  }

  return {
    fields: { name, description, base_price: basePrice, pricing_unit: pricingUnit, capacity },
  }
}

export async function createPackage(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.errors

  const parsed = parsePackageFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const { error } = await admin.from('packages').insert({ ...parsed.fields, is_active: true })

  if (error) return { error: copy.generic }

  revalidatePath('/admin/paquetes')
  redirect('/admin/paquetes')
}

export async function updatePackage(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.errors

  const packageId = formData.get('packageId') as string
  if (!UUID_RE.test(packageId)) return { error: copy.notFound }

  const parsed = parsePackageFields(formData)
  if ('error' in parsed) return { error: parsed.error }

  const { data, error } = await admin
    .from('packages')
    .update(parsed.fields)
    .eq('id', packageId)
    .select('id')

  if (error || !data?.length) return { error: copy.generic }

  revalidatePath('/admin/paquetes')
  redirect('/admin/paquetes')
}

export async function togglePackageActive(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const id = formData.get('id') as string | null
  const isActive = formData.get('is_active') === 'true'

  if (!id || !UUID_RE.test(id)) return

  await admin.from('packages').update({ is_active: !isActive }).eq('id', id)

  revalidatePath('/admin/paquetes')
}

export async function deletePackage(formData: FormData): Promise<{ error: string } | void> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.errors

  const packageId = formData.get('packageId') as string
  if (!UUID_RE.test(packageId)) return { error: copy.notFound }

  const { error } = await admin.from('packages').delete().eq('id', packageId)

  if (error) {
    // 23503 = foreign_key_violation — bookings.package_id is ON DELETE
    // RESTRICT, so a package with any booking history can't be hard-deleted.
    // Surface a clear next step instead of a raw Postgres error.
    if (error.code === '23503') return { error: copy.hasBookings }
    return { error: copy.deleteError }
  }

  revalidatePath('/admin/paquetes')
}

// ── package_items ────────────────────────────────────────────────────────────

const COMPONENT_RE = /^(service|guide_tour):([0-9a-f-]{36})$/i

export async function addPackageItem(formData: FormData): Promise<{ error: string } | void> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.paquetes.items.errors

  const packageId = formData.get('packageId') as string
  if (!UUID_RE.test(packageId)) return { error: adminCopy.paquetes.errors.notFound }

  const component = formData.get('component') as string | null
  const match = component?.match(COMPONENT_RE)
  if (!match) return { error: copy.componentRequired }
  const [, componentType, componentId] = match

  const rawCostPesos = formData.get('internal_cost_pesos') as string | null
  const costPesos = Number(rawCostPesos)
  if (!rawCostPesos || !Number.isFinite(costPesos) || costPesos < 0) {
    return { error: copy.invalidCost }
  }
  // Pesos in the UI, centavos in the DB — same unit convention as
  // transactions.amount_in_cents / provider_payouts.amount_cents.
  const internalCostCents = Math.round(costPesos * 100)

  const rawQuantity = formData.get('quantity_included') as string | null
  const quantity = rawQuantity ? Number(rawQuantity) : 1
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: copy.invalidQuantity }

  // Same predicate as the public listings' own RLS (services_select):
  // an active service/tour whose owning business/guide is no longer in
  // good standing (rejected, deactivated, paused) must not be selectable
  // here either — otherwise a package could silently misrepresent one of
  // its "vetted, trusted" providers.
  const { data: component_row } =
    componentType === 'service'
      ? await admin
          .from('services')
          .select('id, businesses!inner(status, verified)')
          .eq('id', componentId)
          .eq('status', 'active')
          .eq('businesses.status', 'active')
          .eq('businesses.verified', true)
          .maybeSingle()
      : await admin
          .from('guide_tours')
          .select('id, tourist_guides!inner(is_available)')
          .eq('id', componentId)
          .eq('status', 'active')
          .eq('tourist_guides.is_available', true)
          .maybeSingle()

  if (!component_row) return { error: copy.componentNotFound }

  const { error } = await admin.from('package_items').insert({
    package_id: packageId,
    service_id: componentType === 'service' ? componentId : null,
    guide_tour_id: componentType === 'guide_tour' ? componentId : null,
    internal_cost_cents: internalCostCents,
    quantity_included: quantity,
  })

  if (error) return { error: copy.generic }

  revalidatePath(`/admin/paquetes/${packageId}/editar`)
}

export async function removePackageItem(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const itemId = formData.get('itemId') as string | null
  const packageId = formData.get('packageId') as string | null
  if (!itemId || !UUID_RE.test(itemId)) return

  await admin.from('package_items').delete().eq('id', itemId)

  if (packageId && UUID_RE.test(packageId)) {
    revalidatePath(`/admin/paquetes/${packageId}/editar`)
  }
}
