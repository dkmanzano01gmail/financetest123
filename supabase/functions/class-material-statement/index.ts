import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function errorPage(message: string, status: number) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demonstrativo Selá</title><style>body{margin:0;background:#fffbed;color:#3b2327;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:520px;margin:24px;padding:32px;border:1px solid #e6c98c;border-radius:18px;background:white;text-align:center;box-shadow:0 8px 30px #3b232714}h1{font-size:24px;margin:0 0 12px}p{line-height:1.5;margin:0}</style></head><body><main class="card"><h1>Demonstrativo indisponível</h1><p>${message}</p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: jsonHeaders });

  const token = new URL(request.url).searchParams.get("token") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return errorPage("Este link é inválido.", 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return errorPage("Não foi possível abrir o documento agora.", 500);

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const tokenHash = await sha256Hex(token);
  const { data: link, error } = await client
    .from("class_material_statement_links")
    .select("bucket_id, object_path, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !link) return errorPage("Este link não existe ou já foi removido.", 404);
  if (link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return errorPage("Este link expirou. Solicite um novo demonstrativo à Selá Cerâmica.", 410);
  }

  const { data, error: signedUrlError } = await client.storage
    .from(link.bucket_id)
    .createSignedUrl(link.object_path, 60);
  if (signedUrlError || !data?.signedUrl) return errorPage("Não foi possível abrir o PDF agora.", 500);

  return new Response(null, {
    status: 302,
    headers: { Location: data.signedUrl, "Cache-Control": "no-store" },
  });
});
