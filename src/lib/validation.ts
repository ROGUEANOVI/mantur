// Shared across the businesses/places/services create+edit forms and their
// server actions — keep in sync with the DB CHECK constraints added in
// supabase/migrations/20260820000000_add_description_length_limit.sql.
export const DESCRIPTION_MAX_LENGTH = 1200
