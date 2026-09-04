// Shared across the businesses/places/services create+edit forms and their
// server actions — keep in sync with the DB CHECK constraints added in
// supabase/migrations/20260820000000_add_description_length_limit.sql.
export const DESCRIPTION_MAX_LENGTH = 1200

// Shared by every writer of provider_availability (admin queue in
// admin/paquetes/solicitudes/actions.ts, and the self-service actions in
// mi-negocio/actions.ts and mi-perfil-guia/actions.ts) — keep in sync with
// the table's own CHECK constraints (20260903000000_create_packages.sql).
export const AVAILABILITY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const AVAILABILITY_STATUSES = new Set(['available', 'unavailable'])
