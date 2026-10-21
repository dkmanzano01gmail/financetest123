-- Selá Queimas: reserve horizontal spacing between glazed pieces.
-- Width and depth receive the configured margin; height remains unchanged.

ALTER TABLE public.rental_settings
  ADD COLUMN IF NOT EXISTS glaze_spacing_cm numeric NOT NULL DEFAULT 1;

ALTER TABLE public.rental_settings
  DROP CONSTRAINT IF EXISTS rental_settings_glaze_spacing_cm_chk;
ALTER TABLE public.rental_settings
  ADD CONSTRAINT rental_settings_glaze_spacing_cm_chk
  CHECK (glaze_spacing_cm >= 0 AND glaze_spacing_cm <= 20);

ALTER TABLE public.rental_pricing_history
  DROP CONSTRAINT IF EXISTS rental_pricing_history_firing_type_check;
ALTER TABLE public.rental_pricing_history
  ADD CONSTRAINT rental_pricing_history_firing_type_check
  CHECK (firing_type IN ('biscuit', 'glaze', 'glaze_spacing'));

CREATE OR REPLACE FUNCTION public.audit_rental_pricing_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.biscuit_coefficient IS DISTINCT FROM OLD.biscuit_coefficient THEN
    INSERT INTO public.rental_pricing_history (
      workspace_id, firing_type, old_coefficient, new_coefficient, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id, 'biscuit', OLD.biscuit_coefficient, NEW.biscuit_coefficient,
      auth.uid(), auth.jwt() ->> 'email'
    );

    UPDATE public.rental_slots
    SET price_per_liter = NEW.biscuit_coefficient * 1000
    WHERE workspace_id = NEW.workspace_id
      AND firing_type = 'biscuit'
      AND status IN ('draft', 'open');
  END IF;

  IF NEW.glaze_coefficient IS DISTINCT FROM OLD.glaze_coefficient THEN
    INSERT INTO public.rental_pricing_history (
      workspace_id, firing_type, old_coefficient, new_coefficient, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id, 'glaze', OLD.glaze_coefficient, NEW.glaze_coefficient,
      auth.uid(), auth.jwt() ->> 'email'
    );

    UPDATE public.rental_slots
    SET price_per_liter = NEW.glaze_coefficient * 1000
    WHERE workspace_id = NEW.workspace_id
      AND firing_type = 'glaze'
      AND status IN ('draft', 'open');
  END IF;

  IF NEW.glaze_spacing_cm IS DISTINCT FROM OLD.glaze_spacing_cm THEN
    INSERT INTO public.rental_pricing_history (
      workspace_id, firing_type, old_coefficient, new_coefficient, changed_by, changed_by_email
    ) VALUES (
      NEW.workspace_id, 'glaze_spacing', OLD.glaze_spacing_cm, NEW.glaze_spacing_cm,
      auth.uid(), auth.jwt() ->> 'email'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_settings_pricing_audit ON public.rental_settings;
CREATE TRIGGER rental_settings_pricing_audit
AFTER UPDATE OF biscuit_coefficient, glaze_coefficient, glaze_spacing_cm
ON public.rental_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_rental_pricing_changes();

CREATE OR REPLACE FUNCTION public.rental_quote_items_with_spacing(
  _price_per_liter numeric,
  _items jsonb,
  _horizontal_spacing_cm numeric DEFAULT 0
)
RETURNS TABLE(
  piece_name text,
  height_cm numeric,
  width_cm numeric,
  depth_cm numeric,
  quantity integer,
  volume_liters numeric,
  unit_price numeric,
  total_price numeric,
  calculation_width_cm numeric,
  calculation_depth_cm numeric,
  spacing_cm numeric
)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      COALESCE(NULLIF(trim(i->>'piece_name'), ''), 'Peça')::text AS piece_name,
      GREATEST(COALESCE((i->>'height_cm')::numeric, 0), 0) AS height_cm,
      GREATEST(COALESCE((i->>'width_cm')::numeric, 0), 0) AS width_cm,
      GREATEST(COALESCE((i->>'depth_cm')::numeric, 0), 0) AS depth_cm,
      GREATEST(COALESCE((i->>'quantity')::int, 1), 1) AS quantity,
      GREATEST(COALESCE(_horizontal_spacing_cm, 0), 0) AS spacing_cm
    FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS i
  )
  SELECT
    n.piece_name,
    n.height_cm,
    n.width_cm,
    n.depth_cm,
    n.quantity,
    round(
      n.height_cm * (n.width_cm + n.spacing_cm) * (n.depth_cm + n.spacing_cm)
      / 1000.0 * n.quantity,
      3
    ),
    round(
      n.height_cm * (n.width_cm + n.spacing_cm) * (n.depth_cm + n.spacing_cm)
      / 1000.0 * _price_per_liter,
      2
    ),
    round(
      n.height_cm * (n.width_cm + n.spacing_cm) * (n.depth_cm + n.spacing_cm)
      / 1000.0 * n.quantity * _price_per_liter,
      2
    ),
    n.width_cm + n.spacing_cm,
    n.depth_cm + n.spacing_cm,
    n.spacing_cm
  FROM normalized n
$$;

REVOKE ALL ON FUNCTION public.rental_quote_items_with_spacing(numeric, jsonb, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_quote_items_with_spacing(numeric, jsonb, numeric)
  TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rental_public_slots(uuid);
CREATE FUNCTION public.rental_public_slots(_workspace_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  kiln_name text,
  firing_type text,
  capacity_liters numeric,
  used_liters numeric,
  available_liters numeric,
  price_per_liter numeric,
  min_liters numeric,
  opens_at date,
  closes_at date,
  firing_date date,
  pickup_date date,
  glaze_spacing_cm numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.description, s.kiln_name, s.firing_type, s.capacity_liters,
    COALESCE(u.used, 0), GREATEST(s.capacity_liters - COALESCE(u.used, 0), 0),
    s.price_per_liter, s.min_liters, s.opens_at, s.closes_at, s.firing_date, s.pickup_date,
    cfg.glaze_spacing_cm
  FROM public.rental_slots s
  JOIN public.rental_settings cfg ON cfg.workspace_id = s.workspace_id AND cfg.is_published
  LEFT JOIN LATERAL (
    SELECT SUM(o.total_liters) AS used
    FROM public.rental_orders o
    WHERE o.slot_id = s.id AND o.status <> 'cancelled'
  ) u ON true
  WHERE s.workspace_id = _workspace_id
    AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date)
  ORDER BY COALESCE(s.firing_date, s.closes_at, current_date)
$$;
REVOKE ALL ON FUNCTION public.rental_public_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_slots(uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rental_public_quote(_slot_id uuid, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot public.rental_slots;
  cfg public.rental_settings;
  used numeric;
  available numeric;
  total_liters numeric;
  subtotal numeric;
  spacing numeric;
  lines jsonb;
BEGIN
  SELECT s.* INTO slot
  FROM public.rental_slots s
  JOIN public.rental_settings rs ON rs.workspace_id = s.workspace_id AND rs.is_published
  WHERE s.id = _slot_id
    AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date);

  IF slot.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;
  IF jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;

  SELECT * INTO cfg FROM public.rental_settings WHERE workspace_id = slot.workspace_id;
  spacing := CASE WHEN slot.firing_type = 'glaze' THEN cfg.glaze_spacing_cm ELSE 0 END;

  SELECT COALESCE(SUM(o.total_liters), 0) INTO used
  FROM public.rental_orders o
  WHERE o.slot_id = slot.id AND o.status <> 'cancelled';
  available := GREATEST(slot.capacity_liters - used, 0);

  SELECT
    COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb),
    COALESCE(SUM(q.volume_liters), 0),
    COALESCE(SUM(q.total_price), 0)
  INTO lines, total_liters, subtotal
  FROM public.rental_quote_items_with_spacing(slot.price_per_liter, _items, spacing) q;

  RETURN jsonb_build_object(
    'ok', true,
    'slot_id', slot.id,
    'slot_title', slot.title,
    'firing_type', slot.firing_type,
    'glaze_spacing_cm', spacing,
    'price_per_liter', slot.price_per_liter,
    'min_liters', slot.min_liters,
    'capacity_liters', slot.capacity_liters,
    'used_liters', used,
    'available_liters', available,
    'total_liters', total_liters,
    'subtotal', subtotal,
    'total', subtotal,
    'fits', total_liters <= available AND total_liters > 0,
    'meets_minimum', total_liters >= slot.min_liters,
    'items', lines
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rental_public_quote(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_quote(uuid, jsonb)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rental_public_create_order(
  _slot_id uuid,
  _name text,
  _studio_name text,
  _email text,
  _phone text,
  _document text,
  _items jsonb,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot public.rental_slots;
  cfg public.rental_settings;
  used numeric;
  available numeric;
  total_liters numeric;
  subtotal numeric;
  deposit numeric;
  spacing numeric;
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
  IF clean_email IS NULL OR clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     OR length(clean_email) > 160 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF clean_phone IS NULL OR length(clean_phone) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  IF jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;

  SELECT s.* INTO slot
  FROM public.rental_slots s
  JOIN public.rental_settings rs ON rs.workspace_id = s.workspace_id AND rs.is_published
  WHERE s.id = _slot_id
    AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date)
  FOR UPDATE OF s;

  IF slot.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  SELECT * INTO cfg FROM public.rental_settings WHERE workspace_id = slot.workspace_id;
  spacing := CASE WHEN slot.firing_type = 'glaze' THEN cfg.glaze_spacing_cm ELSE 0 END;

  SELECT COALESCE(SUM(q.volume_liters), 0), COALESCE(SUM(q.total_price), 0)
  INTO total_liters, subtotal
  FROM public.rental_quote_items_with_spacing(slot.price_per_liter, _items, spacing) q;

  IF total_liters <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_dimensions');
  END IF;
  IF total_liters < slot.min_liters THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'min_liters', slot.min_liters);
  END IF;

  SELECT COALESCE(SUM(o.total_liters), 0) INTO used
  FROM public.rental_orders o
  WHERE o.slot_id = slot.id AND o.status NOT IN ('cancelled');
  available := GREATEST(slot.capacity_liters - used, 0);
  IF total_liters > available THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_capacity',
      'available_liters', available
    );
  END IF;

  INSERT INTO public.rental_customers (workspace_id, name, studio_name, email, phone, document)
  VALUES (
    slot.workspace_id,
    clean_name,
    clean_studio,
    clean_email,
    clean_phone,
    NULLIF(trim(COALESCE(_document, '')), '')
  )
  ON CONFLICT (workspace_id, lower(email)) DO UPDATE SET
    name = EXCLUDED.name,
    studio_name = EXCLUDED.studio_name,
    phone = COALESCE(EXCLUDED.phone, public.rental_customers.phone),
    document = COALESCE(EXCLUDED.document, public.rental_customers.document),
    updated_at = now()
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

  INSERT INTO public.rental_order_items (
    workspace_id, order_id, piece_name, height_cm, width_cm, depth_cm,
    quantity, volume_liters, unit_price, total_price
  )
  SELECT
    slot.workspace_id, new_order.id, q.piece_name, q.height_cm, q.width_cm, q.depth_cm,
    q.quantity, q.volume_liters, q.unit_price, q.total_price
  FROM public.rental_quote_items_with_spacing(slot.price_per_liter, _items, spacing) q;

  INSERT INTO public.rental_payments (
    workspace_id, order_id, amount, method, paid_at, type, status
  ) VALUES
    (slot.workspace_id, new_order.id, deposit, 'pix', NULL, 'deposit', 'pending'),
    (slot.workspace_id, new_order.id, subtotal - deposit, 'pix', NULL, 'balance', 'pending');

  RETURN jsonb_build_object(
    'ok', true,
    'code', new_order.code,
    'status', new_order.status,
    'total_liters', new_order.total_liters,
    'total', new_order.total,
    'deposit_amount', new_order.deposit_amount,
    'balance_amount', new_order.balance_amount,
    'slot_title', slot.title,
    'firing_date', slot.firing_date,
    'pickup_date', slot.pickup_date,
    'pix_key', cfg.pix_key,
    'address', cfg.address
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rental_public_create_order(
  uuid, text, text, text, text, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_create_order(
  uuid, text, text, text, text, text, jsonb, text
) TO anon, authenticated, service_role;
