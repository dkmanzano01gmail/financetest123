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

/**
 * Submits a customization request, classifies it with Lovable AI,
 * and either auto-applies "easy" changes (entering testing state)
 * or routes "advanced" changes to the super-admin queue.
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

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: data.request_text },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text().catch(() => "");
      if (aiResp.status === 429) throw new Error("Limite de requisições à IA atingido. Tente novamente em instantes.");
      if (aiResp.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`AI gateway error ${aiResp.status}: ${text.slice(0, 200)}`);
    }

    const aiJson: any = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let interpretation: any;
    try {
      interpretation = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      throw new Error("Resposta da IA inválida.");
    }

    const complexity: "easy" | "advanced" =
      interpretation?.complexity === "easy" ? "easy" : "advanced";
    const estimated = Math.max(1, Math.min(30, Number(interpretation?.estimated_credits) || 1));
    const reason: string = String(interpretation?.reason ?? "");
    const type: string = String(interpretation?.type ?? "other");
    const summary: string = String(interpretation?.summary ?? "");
    const config = interpretation?.configuration_json ?? {};

    // Auto-apply everything — no approval flow.
    const applicableTypes = new Set([
      "label_rename",
      "card_visibility",
      "category_rule",
      "saved_filter",
      "new_category",
    ]);
    const hasSideEffect = applicableTypes.has(type);

    // Insert the request first
    const { data: inserted, error } = await (supabase as any)
      .from("customization_requests")
      .insert({
        workspace_id: data.workspace_id,
        user_id: userId,
        request_text: data.request_text,
        request_type: complexity === "easy" ? "simple" : "advanced",
        complexity,
        ai_classification_reason: reason,
        estimated_credits: estimated,
        status: "interpreting",
        ai_interpretation: interpretation,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Credits are unlimited for now — log usage but never block.
    await (supabase as any).rpc("consume_credits", {
      _workspace_id: data.workspace_id,
      _request_id: inserted.id,
      _credits: estimated,
      _reason: summary || "Personalização aplicada",
    }).catch(() => null);

    // Side-effect for new_category
    if (type === "new_category") {
      await (supabase as any).from("categories").insert({
        workspace_id: data.workspace_id,
        name: config?.name ?? "Nova categoria",
        type: config?.type ?? "expense",
        color: config?.color ?? "#c2410c",
        importance_level: config?.importance_level ?? "flexible",
      });
    }

    const { data: createdCust, error: cErr } = await (supabase as any)
      .from("customizations")
      .insert({
        workspace_id: data.workspace_id,
        type,
        name: (summary || data.request_text).slice(0, 80),
        description: summary || null,
        configuration_json: config,
        created_by: userId,
        request_id: inserted.id,
        is_active: hasSideEffect,
      })
      .select()
      .single();
    if (cErr) throw new Error(cErr.message);

    const now = new Date().toISOString();
    const { data: updated } = await (supabase as any)
      .from("customization_requests")
      .update({
        status: "approved",
        auto_applied: true,
        approved_credits: estimated,
        applied_customization_id: createdCust.id,
        tested_at: now,
        approved_at: now,
        completed_at: now,
        rollback_payload: { kind: "delete_customization", customization_id: createdCust.id },
      })
      .eq("id", inserted.id)
      .select()
      .single();

    return { request: updated ?? inserted, autoApplied: true as const };
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
