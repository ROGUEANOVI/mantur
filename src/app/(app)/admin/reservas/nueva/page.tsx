import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import AdminManualBookingForm, {
  type ServiceOption,
  type GuideTourOption,
} from '@/components/admin/AdminManualBookingForm'

export default async function AdminReservasNuevaPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/')

  const admin = createAdminClient()
  const copy = adminCopy.reservas

  const [{ data: servicesData }, { data: toursData }] = await Promise.all([
    admin
      .from('services')
      .select('id, name, base_price, capacity, service_types(pricing_unit), businesses!inner(id, name, status, verified)')
      .eq('status', 'active')
      .eq('businesses.status', 'active')
      .eq('businesses.verified', true)
      .order('name'),
    admin
      .from('guide_tours')
      .select('id, name, price, capacity, guide_id, tourist_guides!inner(is_available, profiles!profile_id(full_name))')
      .eq('status', 'active')
      .eq('tourist_guides.is_available', true)
      .order('name'),
  ])

  const services = (servicesData ?? []) as unknown as ServiceOption[]
  const guideTours = (toursData ?? []) as unknown as GuideTourOption[]

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.subtitle}</p>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <AdminManualBookingForm services={services} guideTours={guideTours} />
        </div>
      </div>
    </main>
  )
}
