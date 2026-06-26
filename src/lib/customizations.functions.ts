import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InterpretInput = z.object({
  workspace_id: z.string().uuid(),
  request_text: z.string().min(3).max(2000),
});

const SYSTEM_PROMPT = `Você é o motor de personalizações do app financeiro "Orna".
O usuário escreve em linguagem natural um pedido de mudança no app.
Responda APENAS com JSON válido (sem markdown). Classifique o pedido em "easy" (a IA aplica sozinha) ou "advanced" (precisa de revisão humana).

Formato:

{
  "type": "label_rename" | "card_visibility" | "category_rule" | "saved_filter" | "new_category" | "dashboard_card" | "other",
  "complexity": "easy" | "advanced",
  "reason": string,
  "estimated_credits": number,
  "summary": string,
  "configuration_json": object
}

Tipos "easy" (a IA aplica direto):
- label_rename: { "labels": { <chave>: "Novo texto" } }. 1 crédito.
  Chaves suportadas:
    • Dashboard/transações: "income", "expense", "balance", "transactions", "incomeSingular", "expenseSingular".
    • Itens do menu lateral (sidebar): "nav.dashboard", "nav.transactions", "nav.accounts", "nav.cards", "nav.budget", "nav.reconciliation", "nav.categories", "nav.import", "nav.customizations", "nav.settings", "nav.admin".
  Mapeie o que o usuário disser para a chave correta. Exemplos:
    • "renomeie a aba Contas para Contas Pessoais" → { "labels": { "nav.accounts": "Contas Pessoais" } }
    • "mude Transações para Lançamentos" → { "labels": { "nav.transactions": "Lançamentos" } }
    • "renomeie Cartões para Cartões de Crédito" → { "labels": { "nav.cards": "Cartões de Crédito" } }
- card_visibility: { "card_id": "income"|"expense"|"balance"|"accounts_balance"|"top_category"|"recent_transactions", "visible": boolean }. 1 crédito.
- category_rule: { "contains": ["uber","99"], "category_name": "Transporte", "transaction_type": "expense" }. 1 crédito.
- saved_filter: { "name": "Gastos da reforma", "filters": { "category_name"?: string, "type"?: "income"|"expense", "search"?: string } }. 1 crédito.
- new_category: { "name": string, "type": "income"|"expense", "color"?: "#aabbcc", "importance_level"?: "essential"|"important"|"flexible"|"superfluous" }. 1 crédito.

Tipos "advanced" (precisam revisão do super-admin — IA NÃO aplica):
- dashboard_card: novo card no dashboard. 3-5 créditos.
- other: mudanças visuais globais (cores, tema), novas telas, novos módulos, integrações, mudanças estruturais. 5-30 créditos.

Regras:
- Mudanças de paleta/tema/cor global → advanced, type "other".
- Renomear menu/tab/aba do sidebar → easy, type "label_rename" se o destino for uma das labels acima.
- summary: 1 frase em pt-BR explicando o que será aplicado.
- reason: explique em 1 frase por que classificou como easy ou advanced.`;

// ============================================================
// Local deterministic classifier — works without AI
// ============================================================

type LocalClassification = {
  type: string;
  complexity: "easy" | "advanced";
  summary: string;
  reason: string;
  estimated_credits: number;
  configuration_json: Record<string, any>;
};

const ADVANCED_KEYWORDS = [
  "nova aba", "nova tab", "novo módulo", "novo modulo", "nova tela",
  "integração", "integracao", "relatório avançado", "relatorio avancado",
  "banco de dados", "permiss", "nova funcionalidade", "automaç", "automac",
  "fluxo de caixa", "deploy", "código", "codigo", "api ", "webhook",
  "paleta", "tema", "cor de fundo", "trocar cor", "mudar cor",
];

const NAV_LABEL_MAP: Record<string, string> = {
  "dashboard": "nav.dashboard",
  "transaç": "nav.transactions", "transac": "nav.transactions", "lançament": "nav.transactions", "lancament": "nav.transactions",
  "conta": "nav.accounts",
  "cartã": "nav.cards", "cartao": "nav.cards", "cartões": "nav.cards", "cartoes": "nav.cards",
  "orçament": "nav.budget", "orcament": "nav.budget",
  "conciliaç": "nav.reconciliation", "conciliac": "nav.reconciliation",
  "categor": "nav.categories",
  "importaç": "nav.import", "importac": "nav.import",
  "personalizaç": "nav.customizations", "personalizac": "nav.customizations",
  "configuraç": "nav.settings", "configurac": "nav.settings", "ajuste": "nav.settings",
};

function detectNavKey(text: string): string | null {
  const t = text.toLowerCase();
  for (const [needle, key] of Object.entries(NAV_LABEL_MAP)) {
    if (t.includes(needle)) return key;
  }
  return null;
}

function extractNewName(text: string): string | null {
  // "para X", "por X", "chamar de X", "ao invés de X", "->" X
  const patterns: RegExp[] = [
    /\bpara\s+["']([^"']{1,60})["']/i,
    /\bpor\s+["']([^"']{1,60})["']/i,
    /\bchamar\s+(?:de\s+)?["']([^"']{1,60})["']/i,
    /->\s*["']?([^"'\n]{1,60})["']?$/i,
    /\bpara\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ\s\-]{0,59})$/i,
    /\bpor\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ\s\-]{0,59})$/i,
    /\bchamar\s+(?:de\s+)?([A-Za-zÀ-ÿ0-9][\wÀ-ÿ\s\-]{0,59})$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim().replace(/[\.\s]+$/, "");
  }
  return null;
}

function classifyLocally(text: string): LocalClassification {
  const t = text.toLowerCase().trim();

  // Advanced detection
  if (ADVANCED_KEYWORDS.some((k) => t.includes(k))) {
    return {
      type: "other", complexity: "advanced",
      summary: text.slice(0, 80),
      reason: "Pedido envolve mudança estrutural ou nova funcionalidade — requer revisão.",
      estimated_credits: 10, configuration_json: {},
    };
  }

  // Rename label/tab — robust: find nav keyword + extract new name.
  // Handles "voltar para X", "ao invés de Y", "mude o nome para X", etc.
  const looksLikeRename = /renomei|nome|chamar|trocar|altere|voltar|volte|ao inv[eé]s|mude|mudar/i.test(t)
    || /aba|tab|menu|item/i.test(t);
  if (looksLikeRename) {
    const key = detectNavKey(t);
    const newValue = extractNewName(text);
    if (key && newValue) {
      return {
        type: "label_rename", complexity: "easy",
        summary: `Renomear "${key}" para "${newValue}"`,
        reason: "Renomeação simples de label de menu.",
        estimated_credits: 1,
        configuration_json: { labels: { [key]: newValue } },
      };
    }
  }

  // New category
  const newCatMatch = t.match(/(?:criar?|adicionar?|nova)\s+(?:uma\s+)?categoria(?:\s+chamada)?\s+["']?([\wçãáéíóúâêôà\s]+?)["']?$/i);
  if (newCatMatch) {
    const name = newCatMatch[1].trim().replace(/\.$/, "");
    const type = /receit|entrad|ganh|salar/i.test(t) ? "income" : "expense";
    return {
      type: "new_category", complexity: "easy",
      summary: `Criar categoria "${name}"`,
      reason: "Criação direta de categoria.",
      estimated_credits: 1,
      configuration_json: { name, type, importance_level: "flexible" },
    };
  }

  // Category rule
  if (/sempre que|toda(?:s)? (?:as )?transaç|categoriz|classificar como/i.test(t)) {
    const catMatch = t.match(/(?:como|categoria)\s+["']?([\wçãáéíóúâêôà\s]+?)["']?[\.\s$]/i)
                  || t.match(/(?:como|categoria)\s+["']?([\wçãáéíóúâêôà\s]+?)["']?$/i);
    const category_name = catMatch ? catMatch[1].trim() : "Sugerida";
    const transaction_type = /receb|positiv|entrad|receit/i.test(t) ? "income" : "expense";
    return {
      type: "category_rule", complexity: "easy",
      summary: `Regra: categorizar como "${category_name}"`,
      reason: "Regra de categorização automática.",
      estimated_credits: 1,
      configuration_json: { description: text, category_name, transaction_type },
    };
  }

  // Hide/show card
  if (/ocultar|esconder|mostrar|exibir/i.test(t)) {
    const visible = /mostrar|exibir/i.test(t);
    let card_id = "balance";
    if (/receit|entrad|incom/i.test(t)) card_id = "income";
    else if (/despes|gast|expense/i.test(t)) card_id = "expense";
    else if (/saldo|balance/i.test(t)) card_id = "balance";
    return {
      type: "card_visibility", complexity: "easy",
      summary: `${visible ? "Mostrar" : "Ocultar"} card "${card_id}"`,
      reason: "Visibilidade de card do dashboard.",
      estimated_credits: 1,
      configuration_json: { card_id, visible },
    };
  }

  // Saved filter
  if (/filtro|filtrar/i.test(t)) {
    return {
      type: "saved_filter", complexity: "easy",
      summary: text.slice(0, 80),
      reason: "Criação de filtro salvo.",
      estimated_credits: 1,
      configuration_json: { name: text.slice(0, 60), filters: { search: "" } },
    };
  }

  // Default: advanced — sends to admin queue rather than getting stuck
  return {
    type: "other", complexity: "advanced",
    summary: text.slice(0, 80),
    reason: "Não foi possível classificar automaticamente — enviado para revisão.",
    estimated_credits: 5, configuration_json: {},
  };
}

async function tryAiInterpret(requestText: string, signal?: AbortSignal): Promise<LocalClassification | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: requestText },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!obj || typeof obj !== "object" || !obj.type) return null;
    return {
      type: String(obj.type),
      complexity: obj.complexity === "easy" ? "easy" : "advanced",
      summary: String(obj.summary ?? ""),
      reason: String(obj.reason ?? ""),
      estimated_credits: Math.max(1, Math.min(30, Number(obj.estimated_credits) || 1)),
      configuration_json: obj.configuration_json ?? {},
    };
  } catch {
    return null;
  }
}

const APPLICABLE_TYPES = new Set([
  "label_rename", "card_visibility", "category_rule", "saved_filter", "new_category",
]);

async function applyAndPersist(
  supabase: any,
  workspaceId: string,
  userId: string,
  requestText: string,
  interp: LocalClassification,
) {
  const isApplicable = interp.complexity === "easy" && APPLICABLE_TYPES.has(interp.type);

  // Easy changes go to "testing" so the user must approve via banner before
  // they become definitive. Advanced ones still queue for super-admin.
  const finalStatus = isApplicable ? "testing" : "needs_admin_review";
  const { data: inserted, error } = await supabase
    .from("customization_requests")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      request_text: requestText,
      request_type: interp.complexity === "easy" ? "simple" : "advanced",
      complexity: interp.complexity,
      ai_classification_reason: interp.reason,
      estimated_credits: interp.estimated_credits,
      status: finalStatus,
      ai_interpretation: interp,
      auto_applied: isApplicable,
    })
    .select().single();
  if (error) throw new Error(error.message);

  // Best-effort credit logging — never let RPC failures break the flow.
  try {
    const { error: rpcErr } = await supabase.rpc("consume_credits", {
      _workspace_id: workspaceId,
      _request_id: inserted.id,
      _credits: interp.estimated_credits,
      _reason: interp.summary || "Personalização",
    });
    if (rpcErr) console.error("consume_credits error:", rpcErr);
  } catch (err) {
    console.error("consume_credits threw:", err);
  }

  if (!isApplicable) {
    return { request: inserted, autoApplied: false as const };
  }

  // Side-effects
  let createdCategoryId: string | null = null;
  if (interp.type === "new_category") {
    const { data: newCat } = await supabase.from("categories").insert({
      workspace_id: workspaceId,
      name: interp.configuration_json?.name ?? "Nova categoria",
      type: interp.configuration_json?.type ?? "expense",
      color: interp.configuration_json?.color ?? "#c2410c",
      importance_level: interp.configuration_json?.importance_level ?? "flexible",
    }).select("id").single();
    createdCategoryId = newCat?.id ?? null;
  }

  const { data: cust, error: cErr } = await supabase
    .from("customizations")
    .insert({
      workspace_id: workspaceId,
      type: interp.type,
      name: (interp.summary || requestText).slice(0, 80) || "Personalização",
      description: interp.summary || null,
      configuration_json: interp.configuration_json ?? {},
      created_by: userId,
      request_id: inserted.id,
      is_active: true,
    })
    .select().single();

  if (cErr) {
    // Don't leave the request orphaned — mark as needing review
    await supabase.from("customization_requests")
      .update({ status: "needs_admin_review", auto_applied: false, ai_classification_reason: `Falha ao aplicar: ${cErr.message}` })
      .eq("id", inserted.id);
    return { request: { ...inserted, status: "needs_admin_review" }, autoApplied: false as const };
  }

  const now = new Date().toISOString();
  const rollback: Record<string, any> = {
    kind: "delete_customization",
    customization_id: cust.id,
  };
  if (createdCategoryId) rollback.category_id = createdCategoryId;

  await supabase.from("customization_requests")
    .update({
      applied_customization_id: cust.id,
      approved_credits: interp.estimated_credits,
      tested_at: now,
      rollback_payload: rollback,
    })
    .eq("id", inserted.id);

  return { request: { ...inserted, applied_customization_id: cust.id, status: "testing" }, autoApplied: true as const };
}

/**
 * Submits a customization request and processes it end-to-end:
 * classifies locally (deterministic), optionally enhances with AI (best-effort
 * with timeout), applies easy changes immediately, or routes advanced ones
 * to the super-admin queue. Never leaves a request in "interpreting" state.
 */
export const submitCustomizationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InterpretInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    // 1) Local classification (always works)
    const local = classifyLocally(data.request_text);

    // 2) Try AI enhancement with 8s timeout — best effort, never blocks
    let interp = local;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const ai = await tryAiInterpret(data.request_text, ctrl.signal);
      clearTimeout(timer);
      if (ai) interp = ai;
    } catch {
      // keep local
    }

    return await applyAndPersist(supabase as any, data.workspace_id, userId, data.request_text, interp);
  });

// ============================================================
// Reprocess stuck requests (interpreting/submitted/pending without resolution)
// ============================================================

const ReprocessInput = z.object({ workspace_id: z.string().uuid() });

export const reprocessPendingRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReprocessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", data.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Forbidden");

    // Pick up: stuck-in-interpreting AND approved requests that never
    // produced a customization row (silent insert failure recovery).
    const { data: stuckRaw } = await (supabase as any)
      .from("customization_requests")
      .select("*, customizations(id)")
      .eq("workspace_id", data.workspace_id)
      .in("status", ["interpreting", "submitted", "pending", "approved"])
      .limit(100);
    const stuck = (stuckRaw ?? []).filter((r: any) => {
      if (r.status !== "approved") return true;
      const hasCust = Array.isArray(r.customizations) && r.customizations.length > 0;
      return !hasCust;
    });

    let processed = 0;
    for (const row of (stuck ?? [])) {
      const existing = row.ai_interpretation;
      let interp: LocalClassification;
      if (existing && typeof existing === "object" && !Array.isArray(existing) && existing.type) {
        interp = {
          type: String(existing.type),
          complexity: existing.complexity === "easy" ? "easy" : "advanced",
          summary: String(existing.summary ?? row.request_text.slice(0, 80)),
          reason: String(existing.reason ?? ""),
          estimated_credits: Math.max(1, Math.min(30, Number(existing.estimated_credits) || 1)),
          configuration_json: existing.configuration_json ?? {},
        };
      } else {
        interp = classifyLocally(row.request_text);
      }

      const isApplicable = interp.complexity === "easy" && APPLICABLE_TYPES.has(interp.type);
      const finalStatus = isApplicable ? "testing" : "needs_admin_review";

      // Side-effect
      let createdCategoryId: string | null = null;
      if (isApplicable && interp.type === "new_category") {
        const { data: newCat } = await (supabase as any).from("categories").insert({
          workspace_id: row.workspace_id,
          name: interp.configuration_json?.name ?? "Nova categoria",
          type: interp.configuration_json?.type ?? "expense",
          color: interp.configuration_json?.color ?? "#c2410c",
          importance_level: interp.configuration_json?.importance_level ?? "flexible",
        }).select("id").single();
        createdCategoryId = newCat?.id ?? null;
      }

      let appliedCustId: string | null = null;
      if (isApplicable) {
        const { data: cust } = await (supabase as any).from("customizations").insert({
          workspace_id: row.workspace_id,
          type: interp.type,
          name: (interp.summary || row.request_text).slice(0, 80) || "Personalização",
          description: interp.summary || null,
          configuration_json: interp.configuration_json ?? {},
          created_by: row.user_id,
          request_id: row.id,
          is_active: true,
        }).select().single();
        appliedCustId = cust?.id ?? null;
      }

      const now = new Date().toISOString();
      const rollback: Record<string, any> | null = isApplicable && appliedCustId
        ? { kind: "delete_customization", customization_id: appliedCustId, ...(createdCategoryId ? { category_id: createdCategoryId } : {}) }
        : null;
      await (supabase as any).from("customization_requests").update({
        status: finalStatus,
        complexity: interp.complexity,
        request_type: interp.complexity === "easy" ? "simple" : "advanced",
        ai_classification_reason: interp.reason,
        ai_interpretation: interp,
        auto_applied: isApplicable,
        applied_customization_id: appliedCustId,
        tested_at: isApplicable ? now : null,
        rollback_payload: rollback,
        approved_at: null,
        completed_at: null,
      }).eq("id", row.id);

      processed += 1;
    }

    return { processed };
  });

// ============================================================
// User testing flow
// ============================================================

const TestActionInput = z.object({
  request_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const userApproveTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TestActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("user_approve_test", {
      _request_id: data.request_id,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const userRejectTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TestActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("user_reject_test", {
      _request_id: data.request_id,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });

// ============================================================
// Super-admin flow
// ============================================================

const AdminActionInput = z.object({
  request_id: z.string().uuid(),
  note: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
});

export const adminApproveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("admin_approve_request", {
      _request_id: data.request_id,
      _admin_note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const adminRejectRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any).rpc("admin_reject_request", {
      _request_id: data.request_id,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });
