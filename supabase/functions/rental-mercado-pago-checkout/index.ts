import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function allowedReturnOrigin(request: Request) {
  const configured = Deno.env.get("PUBLIC_SITE_URL")?.replace(/\/$/, "");
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  if (configured) return configured;
  if (
    origin &&
    (/^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin) ||
      /^https?:\/\/localhost(?::\d+)?$/i.test(origin))
  ) {
    return origin;
  }
  return "https://selafinance.lovable.app";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.action === "status") {
    return json({ enabled: Boolean(accessToken) });
  }
  if (!accessToken) {
    return json({ error: "mercado_pago_not_configured", enabled: false }, 503);
  }

  const code = String(body.orderCode ?? "")
    .trim()
    .toUpperCase();
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!/^SQ-\d{4}-[A-Z0-9]{5}$/.test(code) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "invalid_order" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "backend_not_configured" }, 500);

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: order, error: orderError } = await client
    .from("rental_orders")
    .select(
      "id, code, status, payment_status, deposit_amount, balance_amount, rental_customers!inner(name,email,phone), rental_slots(title)",
    )
    .eq("code", code)
    .ilike("rental_customers.email", email)
    .maybeSingle();

  if (orderError || !order) return json({ error: "order_not_found" }, 404);
  if (["cancelled", "completed"].includes(order.status))
    return json({ error: "order_not_payable" }, 409);
  if (Number(order.deposit_amount) <= 0) return json({ error: "invalid_amount" }, 409);

  const { data: payment, error: paymentError } = await client
    .from("rental_payments")
    .select("id,status,provider_checkout_url,provider_expires_at")
    .eq("order_id", order.id)
    .eq("type", "deposit")
    .maybeSingle();

  if (paymentError || !payment) return json({ error: "payment_not_found" }, 404);
  if (payment.status === "paid") return json({ error: "payment_already_completed" }, 409);

  const expiresAt = payment.provider_expires_at
    ? new Date(payment.provider_expires_at).getTime()
    : 0;
  if (payment.provider_checkout_url && expiresAt > Date.now() + 120_000) {
    return json({ checkoutUrl: payment.provider_checkout_url, reused: true });
  }

  const origin = allowedReturnOrigin(request);
  const returnBase = `${origin}/rental?order=${encodeURIComponent(code)}`;
  const preferenceExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const customer = Array.isArray(order.rental_customers)
    ? order.rental_customers[0]
    : order.rental_customers;
  const slot = Array.isArray(order.rental_slots) ? order.rental_slots[0] : order.rental_slots;
  const nameParts = String(customer?.name ?? "Cliente Selá")
    .trim()
    .split(/\s+/);
  const firstName = nameParts.shift() || "Cliente";
  const lastName = nameParts.join(" ") || "Selá";

  const preference = {
    items: [
      {
        id: order.id,
        title: `Entrada da reserva ${order.code}`,
        description: String(slot?.title ?? "Reserva de queima"),
        category_id: "services",
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(order.deposit_amount),
      },
    ],
    payer: { first_name: firstName, last_name: lastName, email: customer?.email },
    external_reference: order.id,
    statement_descriptor: "SELAQUEIMAS",
    back_urls: {
      success: `${returnBase}&payment=approved`,
      pending: `${returnBase}&payment=pending`,
      failure: `${returnBase}&payment=failure`,
    },
    auto_return: "approved",
    notification_url: `${supabaseUrl}/functions/v1/rental-mercado-pago-webhook`,
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: preferenceExpiresAt.toISOString(),
    payment_methods: {
      excluded_payment_types: [
        { id: "bank_transfer" },
        { id: "ticket" },
        { id: "atm" },
        { id: "digital_currency" },
      ],
      max_installments: 3,
    },
    metadata: { order_code: order.code, payment_type: "deposit" },
  };

  const mercadoPagoResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${order.id}-${Math.floor(Date.now() / 1_800_000)}`,
    },
    body: JSON.stringify(preference),
  });
  const mercadoPago = await mercadoPagoResponse.json().catch(() => ({}));
  const checkoutUrl = mercadoPago.init_point || mercadoPago.sandbox_init_point;
  if (!mercadoPagoResponse.ok || !mercadoPago.id || !checkoutUrl) {
    console.error("Mercado Pago preference error", mercadoPagoResponse.status, mercadoPago);
    return json({ error: "checkout_creation_failed" }, 502);
  }

  const { error: updateError } = await client
    .from("rental_payments")
    .update({
      method: "mercado_pago_card",
      provider_name: "mercado_pago",
      provider_preference_id: String(mercadoPago.id),
      provider_status: "checkout_created",
      provider_checkout_url: checkoutUrl,
      provider_expires_at: preferenceExpiresAt.toISOString(),
    })
    .eq("id", payment.id);

  if (updateError) {
    console.error("Could not persist Mercado Pago preference", updateError);
    return json({ error: "checkout_persistence_failed" }, 500);
  }

  return json({ checkoutUrl, expiresAt: preferenceExpiresAt.toISOString() });
});
