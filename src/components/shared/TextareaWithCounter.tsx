'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// Wraps a plain <textarea> with a live "N/max" counter — used for the
// businesses/places/services description fields, which are capped at
// DESCRIPTION_MAX_LENGTH (src/lib/validation.ts) to match the DB CHECK
// constraint. Takes the caller's full textarea className so each existing
// form's exact visual style carries over unchanged.
export default function TextareaWithCounter({
  id,
  name,
  rows = 3,
  placeholder,
  defaultValue,
  maxLength,
  textareaClassName,
  counterClassName,
}: {
  id: string
  name: string
  rows?: number
  placeholder?: string
  defaultValue?: string
  maxLength: number
  textareaClassName: string
  counterClassName?: string
}) {
  const [length, setLength] = useState(defaultValue?.length ?? 0)
  const counterId = `${id}-counter`

  return (
    <div>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setLength(e.target.value.length)}
        aria-describedby={counterId}
        className={textareaClassName}
      />
      <p id={counterId} className={cn('mt-1 text-right text-xs text-muted-foreground', counterClassName)}>
        {length}/{maxLength}
      </p>
    </div>
  )
}
