CREATE OR REPLACE FUNCTION public.rental_public_create_order(_slot_id uuid, _name text, _email text, _phone text, _items jsonb, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  LOOP
    new_code := 'RNT-' || upper(substr(md5(random()::text || clock_timestamp()::text || _slot_id::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rental_orders o WHERE o.code = new_code);
  END LOOP;

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
$function$;