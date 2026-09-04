'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { getComplianceDocumentUrl } from '@/app/(app)/admin/actions'
import { adminCopy } from '@/lib/copy/admin'

export default function AdminDocumentLink({ label, path }: { label: string; path: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await getComplianceDocumentUrl(path)
    setLoading(false)
    if ('error' in result) {
      toast.error(result.error)
      return
    }
    window.open(result.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <p className="text-xs flex items-center gap-1 flex-wrap">
      <span className="font-medium text-foreground">{label}: </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60"
      >
        <FileText className="size-3" aria-hidden="true" />
        {loading ? '...' : adminCopy.solicitudes.viewDocument}
      </button>
    </p>
  )
}
