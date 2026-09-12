// Shared type for the 'informational' | 'bookable' domain of
// business_categories.default_listing_mode, businesses.listing_mode_override,
// and the return value of the business_listing_mode() SQL RPC
// (see supabase/migrations/20260923200000_add_business_listing_mode.sql).
//
// The resolution rule itself (override > category default > fallback) lives
// only in that SQL function — every call site resolves a business's actual
// listing mode via `.rpc('business_listing_mode', { p_business_id })`, never
// by re-implementing the rule here. This file only carries the shared type.
export type BusinessListingMode = 'informational' | 'bookable'
