type Props = {
  label: string
  name: string
  hint?: string
  required?: boolean
}

// Raw-HTML file input matching the plain <label>/<input> convention used by
// RoleRequestForm/EditGuideProfileForm/EditTransporterProfileForm — distinct
// from ComplianceDocumentField, which wraps the shadcn Label/Input used by
// the mi-negocio forms. Same accept/size contract on both: PDF/JPEG/PNG/WebP,
// validated again server-side regardless of this attribute.
export default function RawFileField({ label, name, hint, required = true }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium text-foreground">{label}</label>
      <input
        id={name}
        type="file"
        name={name}
        required={required}
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="w-full rounded-lg border border-border bg-background text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20 file:transition-colors focus:outline-none focus:ring-2 focus:ring-ring/50"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
