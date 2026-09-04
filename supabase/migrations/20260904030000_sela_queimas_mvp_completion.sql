-- Completa o MVP Selá Queimas e garante que vagas administrativas sejam publicadas.
ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS pix_key text NOT NULL DEFAULT '60.607.671/0001-47',
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_instructions text NOT NULL DEFAULT '';
ALTER TABLE public.rental_settings DROP CONSTRAINT IF EXISTS rental_settings_deposit_percentage_chk;
ALTER TABLE public.rental_settings ADD CONSTRAINT rental_settings_deposit_percentage_chk
  CHECK (deposit_percentage >= 0 AND deposit_percentage <= 100);

ALTER TABLE public.rental_customers
  ADD COLUMN IF NOT EXISTS studio_name text,
  ADD COLUMN IF NOT EXISTS document text;

ALTER TABLE public.rental_orders
  ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_pickup_date date;

ALTER TABLE public.rental_orders DROP CONSTRAINT IF EXISTS rental_orders_status_chk;
ALTER TABLE public.rental_orders ADD CONSTRAINT rental_orders_status_chk CHECK (status IN (
  'pending','awaiting_payment','confirmed','awaiting_delivery','received','awaiting_firing',
  'firing','cooling','ready_for_pickup','completed','cancelled'
));
ALTER TABLE public.rental_orders DROP CONSTRAINT IF EXISTS rental_orders_payment_chk;
ALTER TABLE public.rental_orders ADD CONSTRAINT rental_orders_payment_chk
  CHECK (payment_status IN ('pending','partial','paid','overdue','cancelled','refunded'));

ALTER TABLE public.rental_payments
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid';
ALTER TABLE public.rental_payments ALTER COLUMN paid_at DROP NOT NULL;
ALTER TABLE public.rental_payments DROP CONSTRAINT IF EXISTS rental_payments_type_chk;
ALTER TABLE public.rental_payments ADD CONSTRAINT rental_payments_type_chk
  CHECK (type IS NULL OR type IN ('deposit','balance'));
ALTER TABLE public.rental_payments DROP CONSTRAINT IF EXISTS rental_payments_status_chk;
ALTER TABLE public.rental_payments ADD CONSTRAINT rental_payments_status_chk
  CHECK (status IN ('pending','paid','overdue','cancelled','refunded'));

INSERT INTO public.rental_settings (workspace_id, public_name, headline, description, is_published)
SELECT w.id, 'Selá Queimas', 'Agende sua queima',
  'Informe suas peças, veja o orçamento na hora e reserve espaço no nosso forno.', true
FROM public.workspaces w
WHERE w.id = '37f30192-2237-4949-986b-8ad5d6434f91'
   OR EXISTS (SELECT 1 FROM public.rental_slots s WHERE s.workspace_id = w.id)
ON CONFLICT (workspace_id) DO NOTHING;

UPDATE public.rental_settings
SET public_name = 'Selá Queimas',
    headline = CASE WHEN headline = 'Alugue espaço no nosso forno' THEN 'Agende sua queima' ELSE headline END,
    default_price_per_liter = CASE WHEN default_price_per_liter = 12 THEN 7 ELSE default_price_per_liter END
WHERE public_name = 'Selá Rental';

-- Corrige apenas o valor padrão antigo; valores personalizados permanecem intactos.
UPDATE public.rental_slots
SET price_per_liter = CASE firing_type WHEN 'biscuit' THEN 4.5 ELSE 7 END
WHERE price_per_liter = 12;

CREATE OR REPLACE FUNCTION public.rental_public_payment_info(_workspace_id uuid)
RETURNS TABLE(deposit_percentage numeric, pix_key text, address text, customer_instructions text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.deposit_percentage, s.pix_key, s.address, s.customer_instructions
  FROM public.rental_settings s
  WHERE s.workspace_id = _workspace_id AND s.is_published
$$;
REVOKE ALL ON FUNCTION public.rental_public_payment_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_payment_info(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rental_public_slots(_workspace_id uuid)
RETURNS TABLE(id uuid, title text, description text, kiln_name text, firing_type text,
  capacity_liters numeric, used_liters numeric, available_liters numeric,
  price_per_liter numeric, min_liters numeric, opens_at date, closes_at date,
  firing_date date, pickup_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.title, s.description, s.kiln_name, s.firing_type, s.capacity_liters,
    COALESCE(u.used, 0), GREATEST(s.capacity_liters - COALESCE(u.used, 0), 0),
    s.price_per_liter, s.min_liters, s.opens_at, s.closes_at, s.firing_date, s.pickup_date
  FROM public.rental_slots s
  JOIN public.rental_settings cfg ON cfg.workspace_id = s.workspace_id AND cfg.is_published
  LEFT JOIN LATERAL (
    SELECT SUM(o.total_liters) AS used FROM public.rental_orders o
    WHERE o.slot_id = s.id AND o.status <> 'cancelled'
  ) u ON true
  WHERE s.workspace_id = _workspace_id AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date)
  ORDER BY COALESCE(s.firing_date, s.closes_at, current_date)
$$;
REVOKE ALL ON FUNCTION public.rental_public_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_slots(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rental_public_quote(_slot_id uuid, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  slot public.rental_slots; used numeric; available numeric; total_liters numeric;
  subtotal numeric; lines jsonb;
BEGIN
  SELECT s.* INTO slot FROM public.rental_slots s
  JOIN public.rental_settings cfg ON cfg.workspace_id = s.workspace_id AND cfg.is_published
  WHERE s.id = _slot_id AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date);
  IF slot.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable'); END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;
  SELECT COALESCE(SUM(o.total_liters), 0) INTO used FROM public.rental_orders o
  WHERE o.slot_id = slot.id AND o.status <> 'cancelled';
  available := GREATEST(slot.capacity_liters - used, 0);
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb),
    COALESCE(SUM(q.volume_liters),0), COALESCE(SUM(q.total_price),0)
  INTO lines, total_liters, subtotal
  FROM public.rental_quote_items(slot.price_per_liter, _items) q;
  RETURN jsonb_build_object(
    'ok', true, 'slot_id', slot.id, 'slot_title', slot.title,
    'price_per_liter', slot.price_per_liter, 'min_liters', slot.min_liters,
    'capacity_liters', slot.capacity_liters, 'used_liters', used,
    'available_liters', available, 'total_liters', total_liters,
    'subtotal', subtotal, 'total', subtotal,
    'fits', total_liters <= available AND total_liters > 0,
    'meets_minimum', total_liters >= slot.min_liters, 'items', lines
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rental_public_quote(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_quote(uuid,jsonb) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.rental_public_create_order(uuid, text, text, text, jsonb, text);
CREATE FUNCTION public.rental_public_create_order(
  _slot_id uuid, _name text, _studio_name text, _email text, _phone text,
  _document text, _items jsonb, _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  slot public.rental_slots;
  cfg public.rental_settings;
  used numeric;
  available numeric;
  total_liters numeric;
  subtotal numeric;
  deposit numeric;
  cust_id uuid;
  new_order public.rental_orders;
  new_code text;
  clean_name text := NULLIF(trim(COALESCE(_name, '')), '');
  clean_studio text := NULLIF(trim(COALESCE(_studio_name, '')), '');
  clean_email text := lower(NULLIF(trim(COALESCE(_email, '')), ''));
  clean_phone text := NULLIF(trim(COALESCE(_phone, '')), '');
BEGIN
  IF clean_name IS NULL OR length(clean_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;
  IF clean_studio IS NULL OR length(clean_studio) > 160 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_studio');
  END IF;
  IF clean_email IS NULL OR clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(clean_email) > 160 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF clean_phone IS NULL OR length(clean_phone) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;

  SELECT s.* INTO slot FROM public.rental_slots s
  JOIN public.rental_settings rs ON rs.workspace_id = s.workspace_id AND rs.is_published
  WHERE s.id = _slot_id AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date)
  FOR UPDATE OF s;
  IF slot.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable'); END IF;
  SELECT * INTO cfg FROM public.rental_settings WHERE workspace_id = slot.workspace_id;

  SELECT COALESCE(SUM(q.volume_liters),0), COALESCE(SUM(q.total_price),0)
  INTO total_liters, subtotal FROM public.rental_quote_items(slot.price_per_liter, _items) q;
  IF total_liters <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_dimensions'); END IF;
  IF total_liters < slot.min_liters THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'min_liters', slot.min_liters);
  END IF;
  SELECT COALESCE(SUM(o.total_liters), 0) INTO used FROM public.rental_orders o
  WHERE o.slot_id = slot.id AND o.status NOT IN ('cancelled');
  available := GREATEST(slot.capacity_liters - used, 0);
  IF total_liters > available THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_capacity', 'available_liters', available);
  END IF;

  INSERT INTO public.rental_customers (workspace_id, name, studio_name, email, phone, document)
  VALUES (slot.workspace_id, clean_name, clean_studio, clean_email,
    clean_phone, NULLIF(trim(COALESCE(_document, '')), ''))
  ON CONFLICT (workspace_id, lower(email)) DO UPDATE SET
    name = EXCLUDED.name, studio_name = EXCLUDED.studio_name,
    phone = COALESCE(EXCLUDED.phone, public.rental_customers.phone),
    document = COALESCE(EXCLUDED.document, public.rental_customers.document), updated_at = now()
  RETURNING id INTO cust_id;

  LOOP
    new_code := 'SQ-' || extract(year from current_date)::int || '-' ||
      upper(substr(md5(random()::text || clock_timestamp()::text || _slot_id::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rental_orders o WHERE o.code = new_code);
  END LOOP;
  deposit := round(subtotal * cfg.deposit_percentage / 100, 2);
  INSERT INTO public.rental_orders (
    workspace_id, slot_id, customer_id, code, status, payment_status, total_liters,
    subtotal, total, deposit_amount, balance_amount, estimated_pickup_date, notes
  ) VALUES (
    slot.workspace_id, slot.id, cust_id, new_code, 'awaiting_payment', 'pending', total_liters,
    subtotal, subtotal, deposit, subtotal - deposit, slot.pickup_date,
    NULLIF(trim(COALESCE(_notes, '')), '')
  ) RETURNING * INTO new_order;

  INSERT INTO public.rental_order_items
    (workspace_id, order_id, piece_name, height_cm, width_cm, depth_cm, quantity, volume_liters, unit_price, total_price)
  SELECT slot.workspace_id, new_order.id, q.piece_name, q.height_cm, q.width_cm, q.depth_cm,
    q.quantity, q.volume_liters, q.unit_price, q.total_price
  FROM public.rental_quote_items(slot.price_per_liter, _items) q;

  INSERT INTO public.rental_payments (workspace_id, order_id, amount, method, paid_at, type, status)
  VALUES (slot.workspace_id, new_order.id, deposit, 'pix', NULL, 'deposit', 'pending'),
         (slot.workspace_id, new_order.id, subtotal - deposit, 'pix', NULL, 'balance', 'pending');

  RETURN jsonb_build_object(
    'ok', true, 'code', new_order.code, 'status', new_order.status,
    'total_liters', new_order.total_liters, 'total', new_order.total,
    'deposit_amount', new_order.deposit_amount, 'balance_amount', new_order.balance_amount,
    'slot_title', slot.title, 'firing_date', slot.firing_date, 'pickup_date', slot.pickup_date,
    'pix_key', cfg.pix_key, 'address', cfg.address
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rental_public_create_order(uuid,text,text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_create_order(uuid,text,text,text,text,text,jsonb,text) TO anon, authenticated, service_role;
