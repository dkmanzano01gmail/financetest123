-- Allow customers to track their most recent order with either the reservation
-- code, the registered email, or both. At least one identifier remains required.

CREATE OR REPLACE FUNCTION public.rental_public_order_status(_code text, _email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  normalized_code text := NULLIF(upper(trim(COALESCE(_code, ''))), '');
  normalized_email text := NULLIF(lower(trim(COALESCE(_email, ''))), '');
BEGIN
  IF normalized_code IS NULL AND normalized_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_identifier');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'code', o.code,
    'status', o.status,
    'payment_status', o.payment_status,
    'total', o.total,
    'paid_amount', COALESCE((
      SELECT SUM(p.amount)
      FROM public.rental_payments p
      WHERE p.order_id = o.id AND p.status = 'paid'
    ), 0),
    'pending_amount', GREATEST(o.total - COALESCE((
      SELECT SUM(p.amount)
      FROM public.rental_payments p
      WHERE p.order_id = o.id AND p.status = 'paid'
    ), 0), 0),
    'created_at', o.created_at,
    'slot_title', s.title,
    'firing_type', s.firing_type,
    'firing_date', s.firing_date,
    'pickup_date', s.pickup_date,
    'piece_count', COALESCE((
      SELECT SUM(i.quantity)
      FROM public.rental_order_items i
      WHERE i.order_id = o.id
    ), 0),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'piece_name', i.piece_name,
          'quantity', i.quantity,
          'total_price', i.total_price
        )
        ORDER BY i.created_at
      )
      FROM public.rental_order_items i
      WHERE i.order_id = o.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', p.type,
          'amount', p.amount,
          'status', p.status,
          'paid_at', p.paid_at
        )
        ORDER BY p.created_at
      )
      FROM public.rental_payments p
      WHERE p.order_id = o.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.rental_orders o
  JOIN public.rental_slots s ON s.id = o.slot_id
  JOIN public.rental_customers c ON c.id = o.customer_id
  WHERE (normalized_code IS NULL OR upper(trim(o.code)) = normalized_code)
    AND (normalized_email IS NULL OR lower(trim(c.email)) = normalized_email)
  ORDER BY o.created_at DESC
  LIMIT 1;

  RETURN COALESCE(result, jsonb_build_object('ok', false, 'error', 'not_found'));
END;
$$;

REVOKE ALL ON FUNCTION public.rental_public_order_status(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_public_order_status(text, text)
  TO anon, authenticated, service_role;
