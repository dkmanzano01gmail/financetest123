import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function validWebhookSignature(request: Request, dataId: string) {
  const secret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
  if (!secret) return true;
  const header = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2)));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  return constantTimeEqual(await hmacHex(secret, manifest), parts.v1.toLowerCase());
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!accessToken || !supabaseUrl || !serviceRoleKey)
    return json({ error: "not_configured" }, 500);

  let body: Record<string, any> = {};
  try {
    body = await request.json();
  } catch {
    // Mercado Pago can also send the payment id only in query parameters.
  }
  const url = new URL(request.url);
  const eventType = String(
    body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "",
  );
  const paymentId = String(
    body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "",
  );
  if (!paymentId || (eventType && eventType !== "payment"))
    return json({ received: true, ignored: true });
  if (!(await validWebhookSignature(request, paymentId)))
    return json({ error: "invalid_signature" }, 401);

  const paymentResponse = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!paymentResponse.ok) return json({ error: "payment_lookup_failed" }, 502);
  const mercadoPago = await paymentResponse.json();
  const orderId = String(mercadoPago.external_reference ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ received: true, ignored: true });

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: order, error: orderError } = await client
    .from("rental_orders")
    .select("id,status,deposit_amount,balance_amount")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) return json({ received: true, ignored: true });

  const paidAmount = Number(mercadoPago.transaction_amount ?? 0);
  if (Math.abs(paidAmount - Number(order.deposit_amount)) > 0.01) {
    console.error("Mercado Pago amount mismatch", orderId, paidAmount, order.deposit_amount);
    return json({ error: "amount_mismatch" }, 409);
  }

  const fee = Array.isArray(mercadoPago.fee_details)
    ? mercadoPago.fee_details.reduce((sum: number, item: any) => sum + Number(item.amount ?? 0), 0)
    : 0;
  const providerStatus = String(mercadoPago.status ?? "unknown");
  const paymentUpdate: Record<string, unknown> = {
    method: "mercado_pago_card",
    provider_name: "mercado_pago",
    provider_payment_id: paymentId,
    provider_status: providerStatus,
    payment_fee: fee,
  };
  if (providerStatus === "approved") {
    paymentUpdate.status = "paid";
    paymentUpdate.paid_at = new Date().toISOString().slice(0, 10);
  } else if (["refunded", "charged_back"].includes(providerStatus)) {
    paymentUpdate.status = "refunded";
  }

  const { error: paymentError } = await client
    .from("rental_payments")
    .update(paymentUpdate)
    .eq("order_id", order.id)
    .eq("type", "deposit");
  if (paymentError) return json({ error: "payment_update_failed" }, 500);

  if (providerStatus === "approved") {
    await client
      .from("rental_orders")
      .update({
        status: order.status === "awaiting_payment" ? "confirmed" : order.status,
        payment_status: Number(order.balance_amount) > 0 ? "partial" : "paid",
      })
      .eq("id", order.id);
  } else if (["refunded", "charged_back"].includes(providerStatus)) {
    await client.from("rental_orders").update({ payment_status: "refunded" }).eq("id", order.id);
  }

  return json({ received: true });
});
