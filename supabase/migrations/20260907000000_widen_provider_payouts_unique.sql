-- =============================================================
-- Migration: 20260907000000_widen_provider_payouts_unique
--
-- Fase 5 de Paquetes/Tours (payouts por paquete vendido). Un paquete puede
-- tener varios package_items, cada uno con su propio proveedor
-- (business/guide) y su propio internal_cost_cents — vender un paquete debe
-- poder encolar VARIOS provider_payouts para UNA sola transaction_id, uno
-- por proveedor. La constraint original UNIQUE(transaction_id), creada en
-- 20260830200000_create_provider_payouts_ledger.sql cuando solo existía el
-- caso de un único recipient por booking (service/guide_tour), lo impide.
--
-- Se amplía a UNIQUE(transaction_id, recipient_type, recipient_id): sigue
-- garantizando que un mismo proveedor no reciba dos filas de payout para
-- la misma transacción (el mismo propósito de idempotencia que la
-- constraint original tenía para el caso de un solo proveedor), pero ya
-- permite proveedores distintos bajo la misma transacción.
--
-- enqueue_provider_payout() se redefine con el mismo cuerpo, solo cambia el
-- target del ON CONFLICT para que siga resolviendo por la nueva constraint
-- compuesta en vez de la vieja de una sola columna.
--
-- Sin cambios de RLS — la postura de la tabla (admin-only en las 4
-- operaciones) no se toca.
--
-- Depends on:
--   20260830200000_create_provider_payouts_ledger
--     (provider_payouts, provider_payouts_transaction_id_key,
--      enqueue_provider_payout)
-- =============================================================

ALTER TABLE public.provider_payouts
  DROP CONSTRAINT provider_payouts_transaction_id_key;

ALTER TABLE public.provider_payouts
  ADD CONSTRAINT provider_payouts_transaction_recipient_key
  UNIQUE (transaction_id, recipient_type, recipient_id);

CREATE OR REPLACE FUNCTION public.enqueue_provider_payout(
  p_transaction_id uuid,
  p_recipient_type text,
  p_recipient_id   uuid,
  p_amount_cents   bigint
)
RETURNS TABLE (id uuid, status text, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id     uuid;
  v_status text;
  v_is_new boolean := false;
BEGIN
  IF p_recipient_type NOT IN ('business', 'guide') THEN
    RAISE EXCEPTION 'unknown provider payout recipient type: %', p_recipient_type;
  END IF;

  INSERT INTO public.provider_payouts (transaction_id, recipient_type, recipient_id, amount_cents, status)
  VALUES (p_transaction_id, p_recipient_type, p_recipient_id, p_amount_cents, 'pending')
  ON CONFLICT (transaction_id, recipient_type, recipient_id) DO NOTHING
  RETURNING provider_payouts.id, provider_payouts.status INTO v_id, v_status;

  IF v_id IS NOT NULL THEN
    v_is_new := true;
  ELSE
    -- Ya existía una fila para este (transaction_id, recipient_type,
    -- recipient_id) — reintento de webhook o segundo intento de "marcar
    -- pagada" — se reutiliza en vez de fallar.
    SELECT provider_payouts.id, provider_payouts.status INTO v_id, v_status
    FROM public.provider_payouts
    WHERE transaction_id = p_transaction_id
      AND recipient_type = p_recipient_type
      AND recipient_id = p_recipient_id;
  END IF;

  RETURN QUERY SELECT v_id, v_status, v_is_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_provider_payout(uuid, text, uuid, bigint) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enqueue_provider_payout(uuid, text, uuid, bigint) TO service_role;
