'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'

type ActionResult = { error?: string; success?: boolean }

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

const SLUG_RE = /^[a-z0-9_]+$/

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const admin = await getAuthenticatedAdmin()
  const copy = adminCopy.categorias

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  if (!name) return { error: copy.errors.nameRequired }

  // Auto-generate slug from name: "Casa de campo" → "casa_de_campo"
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accents
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 50)

  if (!slug || !SLUG_RE.test(slug)) return { error: copy.errors.slugFormat }

  // Place new category at the end of the list
  const { data: maxRow } = await admin
    .from('business_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const sortOrder = ((maxRow?.sort_order as number | null) ?? 0) + 1

  const { error } = await admin
    .from('business_categories')
    .insert({ name, slug, sort_order: sortOrder })

  if (error) {
    if (error.code === '23505') return { error: copy.errors.slugTaken }
    return { error: copy.errors.generic }
  }

  revalidatePath('/admin/categorias')
  return { success: true }
}

export async function toggleCategoryActive(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const id = formData.get('id') as string | null
  const isActive = formData.get('is_active') === 'true'

  if (!id) return

  await admin
    .from('business_categories')
    .update({ is_active: !isActive })
    .eq('id', id)

  revalidatePath('/admin/categorias')
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const admin = await getAuthenticatedAdmin()

  const id = formData.get('id') as string | null
  if (!id) return

  await admin
    .from('business_categories')
    .delete()
    .eq('id', id)

  revalidatePath('/admin/categorias')
}
