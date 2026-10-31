-- Selá Queimas: metadata required to reconcile Mercado Pago card checkouts.
-- Card data never touches our database; only provider references and statuses are stored.

ALTER TABLE public.rental_payments
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS provider_preference_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_checkout_url text,
  ADD COLUMN IF NOT EXISTS provider_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_fee numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS rental_payments_provider_payment_uidx
  ON public.rental_payments(provider_name, provider_payment_id)
  WHERE provider_name IS NOT NULL AND provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rental_payments_provider_preference_idx
  ON public.rental_payments(provider_name, provider_preference_id)
  WHERE provider_preference_id IS NOT NULL;

COMMENT ON COLUMN public.rental_payments.provider_checkout_url IS
  'Hosted checkout URL. Never contains card data.';

