# Architecture reference

## Core entities

- `profiles` extends `auth.users` and assigns `tourist`, `business_owner`,
  `transporter`, `tourist_guide`, or `admin` roles.
- `profile_contact_details` stores phone data separately to avoid exposing it
  through profile joins.
- `businesses`, `business_categories`, and `business_category_links` power
  business discovery; `places` holds static attractions.
- `services` are business-owned bookable activities. They use `base_price`,
  `capacity`, and `service_types`; this table was formerly `experiences`.
- `transporters` and `transport_requests` model motocarro availability and ride
  requests.
- `tourist_guides` and `guide_tours` model approved guides and their tours.
- `bookings` represents exactly one service, guide tour, package, or transport
  request and may link to a `transactions` record.
- `packages` and `package_items` are ManTur-operated curated bundles. Provider
  availability is tracked in `provider_availability`.

## Financial and compliance entities

- `transactions` stores payment records and Wompi references.
- `commission_config` defines commission by service type; it is never a code
  constant.
- Provider payout accounts and `provider_payouts` form the payout ledger.
- `refund_policy_config` and `refund_requests` hold refund rules and audit trail.
- Compliance verification stores RNT documents and admin verification state.

## Reviews

- `guide_tour_reviews`, `service_reviews`, and `package_reviews` are tied to
  completed and confirmed bookings.
- `package_item_reviews` records optional per-item feedback.
- `transporter_reviews` is tied to a completed transport request because its
  automated payment path is dormant.

## Boundaries

- Public display must use the least privilege necessary.
- Server Actions and Route Handlers own authorization, money calculations,
  storage-path validation, and payment/webhook processing.
- Every new user or transactional table requires RLS in the same migration.
- Copy is centralized under `src/lib/copy/`; visual tokens are in
  `src/app/globals.css`; use `ManturLogo` rather than duplicating the mark.

