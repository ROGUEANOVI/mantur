---
paths:
  - "src/app/**/actions.ts"
  - "src/app/api/**/*.ts"
  - "src/lib/wompi/**"
  - "src/lib/alegra/**"
---

# Money and payments

- Commission calculations, payment amounts, and transaction status are
  resolved server-side only, in Server Actions or Route Handlers. Never
  trust or compute financial values on the client.
- The commission rate comes from the `commission_config` table via the
  `get_commission_rate()` RPC (EXECUTE granted only to `service_role`) —
  never hardcode a percentage in application code.
- Commission is stored on the booking/transaction at creation time and is
  never recalculated retroactively.
- Verify the Wompi webhook signature before marking a transaction paid — the
  webhook, not the browser, is the source of truth for payment status.
- See `docs/wompi-alegra-integration-plan.md` for the full Wompi checkout,
  webhook, payouts, and refund design, and Alegra invoicing.
