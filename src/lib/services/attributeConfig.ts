// Type-specific extra fields for each `service_types.slug`, stored in
// `services.attributes` (jsonb). Mirrors the discriminator + payload pattern
// already used for `role_requests.metadata` (see mi-negocio/actions.ts sibling
// solicitar-rol/actions.ts). No schema library (zod, etc.) exists in this
// repo — validation is hand-rolled, same style as ../../app/(app)/mi-negocio/parsers.ts.

export type FieldConfig =
  | { key: string; label: string; kind: 'text'; placeholder?: string; required?: boolean }
  | { key: string; label: string; kind: 'number'; min?: number; placeholder?: string; required?: boolean }
  | {
      key: string
      label: string
      kind: 'select'
      options: { value: string; label: string }[]
      required?: boolean
    }

export const SERVICE_TYPE_ATTRIBUTE_FIELDS: Record<string, FieldConfig[]> = {
  tour_activity: [
    { key: 'duration_minutes', label: 'Duración (minutos)', kind: 'number', min: 1 },
    { key: 'meeting_point', label: 'Punto de encuentro', kind: 'text', placeholder: 'Ej: Parque principal' },
  ],
  lodging: [
    { key: 'rooms', label: 'Habitaciones', kind: 'number', min: 1 },
    { key: 'beds', label: 'Camas', kind: 'number', min: 1 },
    { key: 'checkin_time', label: 'Hora de check-in', kind: 'text', placeholder: 'Ej: 15:00' },
    { key: 'checkout_time', label: 'Hora de check-out', kind: 'text', placeholder: 'Ej: 11:00' },
  ],
  event_rental: [
    { key: 'includes', label: 'Incluye', kind: 'text', placeholder: 'Ej: sonido, mobiliario, carpa' },
    { key: 'max_hours', label: 'Horas máximas', kind: 'number', min: 1 },
  ],
  pasadia: [
    {
      key: 'includes_food',
      label: '¿Incluye alimentación?',
      kind: 'select',
      options: [
        { value: 'yes', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    },
  ],
}

// Safe lookup instead of direct bracket access on SERVICE_TYPE_ATTRIBUTE_FIELDS:
// a slug of "__proto__" would otherwise resolve to Object.prototype rather
// than undefined, since the config is a plain object literal.
export function getAttributeFields(slug: string): FieldConfig[] {
  return Object.hasOwn(SERVICE_TYPE_ATTRIBUTE_FIELDS, slug)
    ? SERVICE_TYPE_ATTRIBUTE_FIELDS[slug]
    : []
}

export type PricingUnit = 'per_person' | 'per_night' | 'fixed'

export const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  per_person: 'Precio por persona (COP)',
  per_night: 'Precio por noche (COP)',
  fixed: 'Precio fijo del servicio (COP)',
}

export const QUANTITY_LABELS: Record<PricingUnit, string> = {
  per_person: 'Número de personas',
  per_night: 'Número de noches',
  fixed: 'Cantidad',
}

function attrFieldName(key: string): string {
  return `attr_${key}`
}

// Pulls only the keys defined for this slug's field config out of formData,
// applying each field's own validation. Unknown attr_* keys are ignored.
export function parseAttributes(
  fields: FieldConfig[],
  formData: FormData,
): { attributes: Record<string, unknown> } | { error: string } {
  const attributes: Record<string, unknown> = {}

  for (const field of fields) {
    const raw = formData.get(attrFieldName(field.key))
    const value = typeof raw === 'string' ? raw.trim() : ''

    if (!value) {
      if (field.required) return { error: `${field.label} es requerido.` }
      continue
    }

    if (field.kind === 'number') {
      const n = parseInt(value, 10)
      if (isNaN(n) || (field.min !== undefined && n < field.min)) {
        return { error: `${field.label} debe ser un número válido.` }
      }
      attributes[field.key] = n
      continue
    }

    if (field.kind === 'select') {
      if (!field.options.some((o) => o.value === value)) {
        return { error: `${field.label} no es válido.` }
      }
      attributes[field.key] = value
      continue
    }

    attributes[field.key] = value
  }

  return { attributes }
}
