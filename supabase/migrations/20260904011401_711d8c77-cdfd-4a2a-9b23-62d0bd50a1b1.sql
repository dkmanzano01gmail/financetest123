
-- ============ SETTINGS ============
CREATE TABLE public.rental_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  public_name text NOT NULL DEFAULT 'Selá Rental',
  headline text NOT NULL DEFAULT 'Alugue espaço no nosso forno',
  description text,
  currency text NOT NULL DEFAULT 'BRL',
  default_price_per_liter numeric NOT NULL DEFAULT 12,
  min_order_amount numeric NOT NULL DEFAULT 0,
  terms text,
  contact_email text,
  contact_phone text,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_settings TO authenticated;
GRANT ALL ON public.rental_settings TO service_role;
ALTER TABLE public.rental_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_settings_member_all" ON public.rental_settings FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ SLOTS ============
CREATE TABLE public.rental_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  kiln_name text,
  firing_type text NOT NULL DEFAULT 'glaze',
  capacity_liters numeric NOT NULL DEFAULT 100,
  price_per_liter numeric NOT NULL DEFAULT 12,
  min_liters numeric NOT NULL DEFAULT 0,
  opens_at date,
  closes_at date,
  firing_date date,
  pickup_date date,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_slots_status_chk CHECK (status IN ('draft','open','closed','completed','cancelled')),
  CONSTRAINT rental_slots_capacity_chk CHECK (capacity_liters > 0)
);
CREATE INDEX rental_slots_ws_idx ON public.rental_slots(workspace_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_slots TO authenticated;
GRANT ALL ON public.rental_slots TO service_role;
ALTER TABLE public.rental_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_slots_member_all" ON public.rental_slots FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ CUSTOMERS ============
CREATE TABLE public.rental_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rental_customers_ws_email_idx ON public.rental_customers(workspace_id, lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_customers TO authenticated;
GRANT ALL ON public.rental_customers TO service_role;
ALTER TABLE public.rental_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_customers_member_all" ON public.rental_customers FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ ORDERS ============
CREATE TABLE public.rental_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.rental_slots(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.rental_customers(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_status text NOT NULL DEFAULT 'pending',
  total_liters numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_orders_status_chk CHECK (status IN ('pending','confirmed','cancelled','completed')),
  CONSTRAINT rental_orders_payment_chk CHECK (payment_status IN ('pending','partial','paid','refunded'))
);
CREATE UNIQUE INDEX rental_orders_code_idx ON public.rental_orders(workspace_id, code);
CREATE INDEX rental_orders_slot_idx ON public.rental_orders(slot_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_orders TO authenticated;
GRANT ALL ON public.rental_orders TO service_role;
ALTER TABLE public.rental_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_orders_member_all" ON public.rental_orders FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ ORDER ITEMS ============
CREATE TABLE public.rental_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.rental_orders(id) ON DELETE CASCADE,
  piece_name text NOT NULL,
  height_cm numeric NOT NULL DEFAULT 0,
  width_cm numeric NOT NULL DEFAULT 0,
  depth_cm numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  volume_liters numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_order_items_order_idx ON public.rental_order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_order_items TO authenticated;
GRANT ALL ON public.rental_order_items TO service_role;
ALTER TABLE public.rental_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_order_items_member_all" ON public.rental_order_items FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ PAYMENTS ============
CREATE TABLE public.rental_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.rental_orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  method text,
  paid_at date NOT NULL DEFAULT current_date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_payments_order_idx ON public.rental_payments(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_payments TO authenticated;
GRANT ALL ON public.rental_payments TO service_role;
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_payments_member_all" ON public.rental_payments FOR ALL TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ TRIGGERS ============
CREATE TRIGGER rental_settings_touch BEFORE UPDATE ON public.rental_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER rental_slots_touch BEFORE UPDATE ON public.rental_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER rental_customers_touch BEFORE UPDATE ON public.rental_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER rental_orders_touch BEFORE UPDATE ON public.rental_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER rental_order_items_touch BEFORE UPDATE ON public.rental_order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER rental_payments_touch BEFORE UPDATE ON public.rental_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PUBLIC RPCs (SECURITY DEFINER) ============

-- Helper: quote math from a jsonb array of items
CREATE OR REPLACE FUNCTION public.rental_quote_items(_price_per_liter numeric, _items jsonb)
RETURNS TABLE(piece_name text, height_cm numeric, width_cm numeric, depth_cm numeric, quantity integer, volume_liters numeric, unit_price numeric, total_price numeric)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(trim(i->>'piece_name'), ''), 'Peça')::text,
    GREATEST(COALESCE((i->>'height_cm')::numeric, 0), 0),
    GREATEST(COALESCE((i->>'width_cm')::numeric, 0), 0),
    GREATEST(COALESCE((i->>'depth_cm')::numeric, 0), 0),
    GREATEST(COALESCE((i->>'quantity')::int, 1), 1),
    round((GREATEST(COALESCE((i->>'height_cm')::numeric,0),0) * GREATEST(COALESCE((i->>'width_cm')::numeric,0),0) * GREATEST(COALESCE((i->>'depth_cm')::numeric,0),0) / 1000.0) * GREATEST(COALESCE((i->>'quantity')::int,1),1), 3),
    round((GREATEST(COALESCE((i->>'height_cm')::numeric,0),0) * GREATEST(COALESCE((i->>'width_cm')::numeric,0),0) * GREATEST(COALESCE((i->>'depth_cm')::numeric,0),0) / 1000.0) * _price_per_liter, 2),
    round((GREATEST(COALESCE((i->>'height_cm')::numeric,0),0) * GREATEST(COALESCE((i->>'width_cm')::numeric,0),0) * GREATEST(COALESCE((i->>'depth_cm')::numeric,0),0) / 1000.0) * GREATEST(COALESCE((i->>'quantity')::int,1),1) * _price_per_liter, 2)
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) AS i
$$;
REVOKE ALL ON FUNCTION public.rental_quote_items(numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_quote_items(numeric, jsonb) TO authenticated, service_role;

-- Public: studio info
CREATE OR REPLACE FUNCTION public.rental_public_info(_workspace_id uuid)
RETURNS TABLE(public_name text, headline text, description text, currency text, terms text, contact_email text, contact_phone text, default_price_per_liter numeric, min_order_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.public_name, s.headline, s.description, s.currency, s.terms, s.contact_email, s.contact_phone, s.default_price_per_liter, s.min_order_amount
  FROM public.rental_settings s
  WHERE s.workspace_id = _workspace_id AND s.is_published
$$;
REVOKE ALL ON FUNCTION public.rental_public_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_info(uuid) TO anon, authenticated, service_role;

-- Public: open slots with capacity usage
CREATE OR REPLACE FUNCTION public.rental_public_slots(_workspace_id uuid)
RETURNS TABLE(id uuid, title text, description text, kiln_name text, firing_type text, capacity_liters numeric, used_liters numeric, available_liters numeric, price_per_liter numeric, min_liters numeric, opens_at date, closes_at date, firing_date date, pickup_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.title, s.description, s.kiln_name, s.firing_type, s.capacity_liters,
    COALESCE(u.used, 0) AS used_liters,
    GREATEST(s.capacity_liters - COALESCE(u.used, 0), 0) AS available_liters,
    s.price_per_liter, s.min_liters, s.opens_at, s.closes_at, s.firing_date, s.pickup_date
  FROM public.rental_slots s
  JOIN public.rental_settings cfg ON cfg.workspace_id = s.workspace_id AND cfg.is_published
  LEFT JOIN LATERAL (
    SELECT SUM(o.total_liters) AS used FROM public.rental_orders o
    WHERE o.slot_id = s.id AND o.status IN ('pending','confirmed','completed')
  ) u ON true
  WHERE s.workspace_id = _workspace_id
    AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date)
  ORDER BY COALESCE(s.firing_date, s.closes_at, current_date) ASC
$$;
REVOKE ALL ON FUNCTION public.rental_public_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_slots(uuid) TO anon, authenticated, service_role;

-- Public: quote
CREATE OR REPLACE FUNCTION public.rental_public_quote(_slot_id uuid, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot public.rental_slots;
  used numeric;
  available numeric;
  total_liters numeric;
  subtotal numeric;
  lines jsonb;
BEGIN
  SELECT s.* INTO slot FROM public.rental_slots s
  JOIN public.rental_settings cfg ON cfg.workspace_id = s.workspace_id AND cfg.is_published
  WHERE s.id = _slot_id AND s.status = 'open';
  IF slot.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;

  SELECT COALESCE(SUM(o.total_liters), 0) INTO used FROM public.rental_orders o
  WHERE o.slot_id = slot.id AND o.status IN ('pending','confirmed','completed');
  available := GREATEST(slot.capacity_liters - used, 0);

  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb), COALESCE(SUM(q.volume_liters),0), COALESCE(SUM(q.total_price),0)
    INTO lines, total_liters, subtotal
  FROM public.rental_quote_items(slot.price_per_liter, _items) q;

  RETURN jsonb_build_object(
    'ok', true,
    'slot_id', slot.id,
    'slot_title', slot.title,
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
GRANT EXECUTE ON FUNCTION public.rental_public_quote(uuid, jsonb) TO anon, authenticated, service_role;

-- Public: create order (reservation)
CREATE OR REPLACE FUNCTION public.rental_public_create_order(
  _slot_id uuid, _name text, _email text, _phone text, _items jsonb, _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slot public.rental_slots;
  used numeric;
  available numeric;
  total_liters numeric;
  subtotal numeric;
  cust_id uuid;
  new_order public.rental_orders;
  new_code text;
  clean_name text := NULLIF(trim(COALESCE(_name, '')), '');
  clean_email text := lower(NULLIF(trim(COALESCE(_email, '')), ''));
BEGIN
  IF clean_name IS NULL OR length(clean_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;
  IF clean_email IS NULL OR clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(clean_email) > 160 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items');
  END IF;

  SELECT s.* INTO slot FROM public.rental_slots s
  JOIN public.rental_settings cfg ON cfg.workspace_id = s.workspace_id AND cfg.is_published
  WHERE s.id = _slot_id AND s.status = 'open'
    AND (s.opens_at IS NULL OR s.opens_at <= current_date)
    AND (s.closes_at IS NULL OR s.closes_at >= current_date)
  FOR UPDATE OF s;
  IF slot.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  END IF;

  SELECT COALESCE(SUM(q.volume_liters),0), COALESCE(SUM(q.total_price),0)
    INTO total_liters, subtotal
  FROM public.rental_quote_items(slot.price_per_liter, _items) q;

  IF total_liters <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_dimensions');
  END IF;
  IF total_liters < slot.min_liters THEN
    RETURN jsonb_build_object('ok', false, 'error', 'below_minimum', 'min_liters', slot.min_liters);
  END IF;

  SELECT COALESCE(SUM(o.total_liters), 0) INTO used FROM public.rental_orders o
  WHERE o.slot_id = slot.id AND o.status IN ('pending','confirmed','completed');
  available := GREATEST(slot.capacity_liters - used, 0);
  IF total_liters > available THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_capacity', 'available_liters', available);
  END IF;

  INSERT INTO public.rental_customers (workspace_id, name, email, phone)
  VALUES (slot.workspace_id, clean_name, clean_email, NULLIF(trim(COALESCE(_phone, '')), ''))
  ON CONFLICT (workspace_id, lower(email)) DO UPDATE
    SET name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, public.rental_customers.phone),
        updated_at = now()
  RETURNING id INTO cust_id;

  new_code := 'RNT-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  INSERT INTO public.rental_orders (workspace_id, slot_id, customer_id, code, status, total_liters, subtotal, total, notes)
  VALUES (slot.workspace_id, slot.id, cust_id, new_code, 'pending', total_liters, subtotal, subtotal, NULLIF(trim(COALESCE(_notes, '')), ''))
  RETURNING * INTO new_order;

  INSERT INTO public.rental_order_items (workspace_id, order_id, piece_name, height_cm, width_cm, depth_cm, quantity, volume_liters, unit_price, total_price)
  SELECT slot.workspace_id, new_order.id, q.piece_name, q.height_cm, q.width_cm, q.depth_cm, q.quantity, q.volume_liters, q.unit_price, q.total_price
  FROM public.rental_quote_items(slot.price_per_liter, _items) q;

  RETURN jsonb_build_object(
    'ok', true,
    'code', new_order.code,
    'status', new_order.status,
    'total_liters', new_order.total_liters,
    'total', new_order.total,
    'slot_title', slot.title,
    'firing_date', slot.firing_date,
    'pickup_date', slot.pickup_date
  );
END;
$$;
REVOKE ALL ON FUNCTION public.rental_public_create_order(uuid, text, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_create_order(uuid, text, text, text, jsonb, text) TO anon, authenticated, service_role;

-- Public: order lookup by code + email
CREATE OR REPLACE FUNCTION public.rental_public_order_status(_code text, _email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'ok', true,
    'code', o.code,
    'status', o.status,
    'payment_status', o.payment_status,
    'total_liters', o.total_liters,
    'total', o.total,
    'created_at', o.created_at,
    'slot_title', s.title,
    'firing_date', s.firing_date,
    'pickup_date', s.pickup_date,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('piece_name', i.piece_name, 'quantity', i.quantity, 'volume_liters', i.volume_liters, 'total_price', i.total_price))
      FROM public.rental_order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.rental_orders o
  JOIN public.rental_slots s ON s.id = o.slot_id
  JOIN public.rental_customers c ON c.id = o.customer_id
  WHERE upper(trim(o.code)) = upper(trim(COALESCE(_code, '')))
    AND lower(c.email) = lower(trim(COALESCE(_email, '')));

  RETURN COALESCE(result, jsonb_build_object('ok', false, 'error', 'not_found'));
END;
$$;
REVOKE ALL ON FUNCTION public.rental_public_order_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_order_status(text, text) TO anon, authenticated, service_role;
