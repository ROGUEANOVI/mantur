import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminCopy } from '@/lib/copy/admin'
import { createBusinessAsAdmin } from '@/app/(app)/admin/actions'
import AdminBusinessForm from '@/components/admin/AdminBusinessForm'

export default async function NuevoNegocioPage() {
  const admin = createAdminClient()

  const { data: owners } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'business_owner')
    .order('full_name', { ascending: true })

  const copy = adminCopy.negocios

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/admin/negocios"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.form.backToList}
        </Link>

        <h1 className="text-2xl font-bold text-foreground">{copy.form.title}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <AdminBusinessForm
            action={createBusinessAsAdmin}
            owners={owners ?? []}
          />
        </div>
      </div>
    </main>
  )
}
