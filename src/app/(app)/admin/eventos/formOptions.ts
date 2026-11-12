import type { createAdminClient } from '@/lib/supabase/admin'

type Option = { id: string; name: string }

// Places and packages an event can link to. Inactive packages are left out:
// the banner would fall back to WhatsApp for them anyway.
export async function loadEventFormOptions(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ places: Option[]; packages: Option[] }> {
  const [{ data: places }, { data: packages }] = await Promise.all([
    admin.from('places').select('id, name').order('name'),
    admin.from('packages').select('id, name').eq('is_active', true).order('name'),
  ])
  return { places: (places ?? []) as Option[], packages: (packages ?? []) as Option[] }
}
