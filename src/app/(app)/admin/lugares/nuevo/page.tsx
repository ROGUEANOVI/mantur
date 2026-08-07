import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { adminCopy } from '@/lib/copy/admin'
import { createPlace } from '@/app/(app)/admin/actions'
import LugarForm from '@/components/admin/LugarForm'

export default function NuevoLugarPage() {
  const copy = adminCopy.lugares

  return (
    <main className="px-4 py-6 pb-10">
      <div className="mx-auto max-w-lg space-y-5">
        <Link
          href="/admin/lugares"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary min-h-11 py-2 hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {copy.form.backToList}
        </Link>

        <h1 className="text-2xl font-bold text-foreground">{copy.new}</h1>

        <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
          <LugarForm action={createPlace} />
        </div>
      </div>
    </main>
  )
}
