import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  label: string
  name: string
  hint?: string
  required?: boolean
}

export default function ComplianceDocumentField({ label, name, hint, required = true }: Props) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-sm font-medium">{label}</Label>
      <Input
        id={name}
        type="file"
        name={name}
        required={required}
        accept="application/pdf,image/jpeg,image/png,image/webp"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
