'use client'

import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function PasswordInput({
  id,
  name,
  show,
  onToggle,
  autoComplete,
  placeholder,
  value,
  onChange,
}: {
  id: string
  name: string
  show: boolean
  onToggle: () => void
  autoComplete?: string
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        name={name}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
      >
        {show
          ? <EyeOff className="size-4" aria-hidden="true" />
          : <Eye    className="size-4" aria-hidden="true" />
        }
      </button>
    </div>
  )
}
