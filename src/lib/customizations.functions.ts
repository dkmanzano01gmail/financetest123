import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InterpretInput = z.object({
  workspace_id: z.string().uuid(),
  request_text: z.string().min(3).max(2000),
});

const SYSTEM_PROMPT = `Você é o motor de personalizações do app financeiro "Orna".
O usuário escreve em linguagem natural um pedido de mudança no app.
Responda APENAS com JSON válido (sem markdown) no formato:

{
  "type": "label_rename" | "card_visibility" | "category_rule" | "saved_filter" | "new_category" | "dashboard_card" | "other",
  "complexity": "simple" | "medium" | "advanced",
  "estimated_credits": number,
  "summary": string,
  "configuration_json": object,
  "auto_appliable": boolean
}

Tipos e configuration_json:
- label_rename: { "labels": { "income"|"expense"|"balance"|"transactions"|"incomeSingular"|"expenseSingular": "Novo texto" } }. simple, auto=true, 1 crédito.
- card_visibility: { "card_id": "income"|"expense"|"balance"|"accounts_balance"|"top_category"|"recent_transactions", "visible": boolean }. simple, auto=true, 1 crédito.
- category_rule: { "contains": ["uber","99"], "category_name": "Transporte", "transaction_type": "expense" }. simple, auto=true, 1 crédito.
- saved_filter: { "name": "Gastos da reforma", "filters": { "category_name"?: string, "type"?: "income"|"expense", "search"?: string } }. simple, auto=true, 1 crédito.
- new_category: { "name": string, "type": "income"|"expense", "color"?: "#aabbcc", "importance_level"?: "essential"|"important"|"flexible"|"superfluous" }. simple, auto=true, 1 crédito.
- dashboard_card: { "title": string, "metric": "sum_transactions", "filters": {...}, "format": "currency" }. medium, auto=false, 3-5 créditos.
- other: nova tela, módulo, integração, cálculo complexo. medium/advanced, auto=false, 5-20 créditos.

summary: 1 frase em pt-BR explicando o que será aplicado.`;

export const interpretCustomization = createServerFn({ method: "POST" })
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
        model: "google/gemini-2.5-flash",
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

    const complexity = ["simple", "medium", "advanced"].includes(interpretation?.complexity)
      ? interpretation.complexity
      : "medium";
    const estimated = Math.max(1, Math.min(20, Number(interpretation?.estimated_credits) || 1));

    const { data: inserted, error } = await (supabase as any)
      .from("customization_requests")
      .insert({
        workspace_id: data.workspace_id,
        user_id: userId,
        request_text: data.request_text,
        request_type: complexity,
        estimated_credits: estimated,
        status: "analyzed",
        ai_interpretation: interpretation,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return inserted;
  });
