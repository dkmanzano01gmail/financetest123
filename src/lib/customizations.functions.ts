import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  registryAsPromptFragment,
  type CategoryRule,
  type RuleCondition,
} from "@/lib/customization-registry";
import {
  CALCULATION_REVIEW_MESSAGE,
  canAutoApply,
  validateAutoOperation,
  type TargetScope,
} from "@/lib/customization-schema";

const InterpretInput = z.object({
  workspace_id: z.string().uuid(),
  request_text: z.string().min(3).max(2000),
  target_scope: z.enum(["user", "workspace"]).default("user"),
});

const SYSTEM_PROMPT = `Você é o motor de personalizações do app financeiro Selá.
O usuário escreve em linguagem natural um pedido de mudança.
Responda APENAS com JSON válido (sem markdown).

Formato:
{
  "type": "label_rename"|"card_visibility"|"category_rule"|"saved_filter"|"new_category"|"other",
  "complexity": "easy"|"advanced",
  "reason": string,
  "estimated_credits": number,
  "summary": string,
  "configuration_json": object
}

${registryAsPromptFragment()}

Regras de classificação:
- Se o pedido couber em uma das primitivas acima → "easy", e configuration_json segue o shape descrito.
- Se for criação de categoria + condição automática (ex.: "tudo do mesmo nome todo mês = Aulas"), use category_rule com a nova schema { rule: { category_name, transaction_type?, conditions:[...] } }.
- Mudanças de tema/cor global, criação de telas novas, integrações → "advanced" type "other".
- summary: 1 frase em pt-BR.`;

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
  "novo módulo",
  "novo modulo",
  "nova tela",
  "integração",
  "integracao",
  "relatório avançado",
  "relatorio avancado",
  "banco de dados",
  "permiss",
  "nova funcionalidade",
  "automaç",
  "automac",
  "fluxo de caixa",
  "deploy",
  "código",
  "codigo",
  "api ",
  "webhook",
  "paleta",
  "tema",
  "cor de fundo",
  "trocar cor",
  "mudar cor",
];

const NAV_LABEL_MAP: Record<string, string> = {
  dashboard: "nav.dashboard",
  transaç: "nav.transactions",
  transac: "nav.transactions",
  lançament: "nav.transactions",
  lancament: "nav.transactions",
  conta: "nav.accounts",
  cartã: "nav.cards",
  cartao: "nav.cards",
  cartões: "nav.cards",
  cartoes: "nav.cards",
  orçament: "nav.budget",
  orcament: "nav.budget",
  conciliaç: "nav.reconciliation",
  conciliac: "nav.reconciliation",
  categor: "nav.categories",
  importaç: "nav.import",
  importac: "nav.import",
  personalizaç: "nav.customizations",
  personalizac: "nav.customizations",
  configuraç: "nav.settings",
  configurac: "nav.settings",
  ajuste: "nav.settings",
  "fluxo de caixa": "nav.atelier.cash_flow",
  "matéria-prima": "nav.atelier.raw_materials",
  "materia-prima": "nav.atelier.raw_materials",
  "matérias-primas": "nav.atelier.raw_materials",
  "materiais de aula": "nav.atelier.class_materials",
  presenç: "nav.atelier.attendance",
  presenc: "nav.atelier.attendance",
  aluno: "nav.atelier.students",
  forno: "nav.atelier.kilns",
  reforma: "nav.atelier.renovation",
  "precificação de peça": "nav.atelier.pieces",
  peça: "nav.atelier.pieces",
  peca: "nav.atelier.pieces",
  workshop: "nav.atelier.workshops",
  queima: "nav.atelier.firings",
  feedback: "nav.feedback",
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
      type: "other",
      complexity: "advanced",
      summary: text.slice(0, 80),
      reason: "Pedido envolve mudança estrutural ou nova funcionalidade — requer revisão.",
      estimated_credits: 10,
      configuration_json: {},
    };
  }

  // Rename label/tab — robust: find nav keyword + extract new name.
  // Handles "voltar para X", "ao invés de Y", "mude o nome para X", etc.
  const looksLikeRename =
    /renomei|nome|chamar|trocar|altere|voltar|volte|ao inv[eé]s|mude|mudar/i.test(t) ||
    /aba|tab|menu|item/i.test(t);
  if (looksLikeRename) {
    const key = detectNavKey(t);
    const newValue = extractNewName(text);
    if (key && newValue) {
      return {
        type: "label_rename",
        complexity: "easy",
        summary: `Renomear "${key}" para "${newValue}"`,
        reason: "Renomeação simples de label de menu.",
        estimated_credits: 1,
        configuration_json: { labels: { [key]: newValue } },
      };
    }
  }

  // New category
  const newCatMatch = t.match(
    /(?:criar?|adicionar?|nova)\s+(?:uma\s+)?categoria(?:\s+chamada)?\s+["']?([\wçãáéíóúâêôà\s]+?)["']?$/i,
  );
  if (newCatMatch) {
    const name = newCatMatch[1].trim().replace(/\.$/, "");
    const type = /receit|entrad|ganh|salar/i.test(t) ? "income" : "expense";
    return {
      type: "new_category",
      complexity: "easy",
      summary: `Criar categoria "${name}"`,
      reason: "Criação direta de categoria.",
      estimated_credits: 1,
      configuration_json: { name, type, importance_level: "flexible" },
    };
  }

  // Category rule — rich detection (descriptor / amount / recurrence / counterparty)
  const looksLikeRule =
    /sempre que|toda(?:s)? (?:as )?transaç|categoriz|classificar como|considerar? como|considere|pode considerar/i.test(
      t,
    );
  if (looksLikeRule) {
    return buildLocalCategoryRule(text);
  }

  // Hide/show menu tab (nav_visibility) — must be checked before card_visibility
  // because "esconder aba contas" mentions both "esconder" and a nav key.
  if (
    /(ocultar|esconder|tirar|remover|mostrar|exibir)/i.test(t) &&
    /(aba|menu|item do menu|sidebar|t[aá]b)/i.test(t)
  ) {
    const visible = /mostrar|exibir/i.test(t);
    const key = detectNavKey(t);
    if (key) {
      return {
        type: "nav_visibility",
        complexity: "easy",
        summary: `${visible ? "Mostrar" : "Ocultar"} aba "${key}"`,
        reason: "Visibilidade de item de menu.",
        estimated_credits: 1,
        configuration_json: { menu_key: key, visible },
      };
    }
  }

  // Reorder menu: "colocar X antes de Y", "mover X para o topo/início/fim"
  if (
    /(reorden|coloc(ar|ue)|mover|mude\s+a\s+ordem|trocar\s+a\s+ordem|antes\s+de|depois\s+de|para\s+(o\s+)?(topo|in[ií]cio|fim))/i.test(
      t,
    )
  ) {
    // Best-effort: detect 2 nav keys and produce a relative order; full order
    // is too ambiguous for the local parser, so we mark advanced when not confident.
    const hits: string[] = [];
    for (const [needle, key] of Object.entries(NAV_LABEL_MAP)) {
      if (t.includes(needle) && !hits.includes(key)) hits.push(key);
    }
    if (hits.length >= 2) {
      // "X antes de Y" → [X, Y]; "depois de" → [Y, X]
      const afterMode = /\bdepois\s+de\b/.test(t);
      const order = afterMode ? [hits[1], hits[0]] : [hits[0], hits[1]];
      return {
        type: "nav_reorder",
        complexity: "easy",
        summary: `Reordenar menu: ${order.join(" → ")}`,
        reason: "Reordenação parcial do menu (demais itens preservados).",
        estimated_credits: 2,
        configuration_json: { order },
      };
    }
  }

  // Hide/show dashboard card
  if (
    /(ocultar|esconder|tirar|remover|mostrar|exibir)/i.test(t) &&
    /(card|widget|gr[aá]fico|bloco|painel|caixa)/i.test(t)
  ) {
    const visible = /mostrar|exibir/i.test(t);
    let card_id: string | null = null;
    if (/receit|entrad|incom/i.test(t)) card_id = "income";
    else if (/despes|gast|expense|sa[ií]da/i.test(t)) card_id = "expense";
    else if (/saldo em contas|conta/i.test(t)) card_id = "accounts_balance";
    else if (/saldo|balance/i.test(t)) card_id = "balance";
    else if (/recente|[uú]ltimas/i.test(t)) card_id = "recent_transactions";
    else if (/categoria/i.test(t)) card_id = "top_category";
    if (card_id) {
      return {
        type: "card_visibility",
        complexity: "easy",
        summary: `${visible ? "Mostrar" : "Ocultar"} card "${card_id}"`,
        reason: "Visibilidade de card do dashboard.",
        estimated_credits: 1,
        configuration_json: { card_id, visible },
      };
    }
  }

  // Saved filter
  if (/filtro|filtrar/i.test(t)) {
    return {
      type: "saved_filter",
      complexity: "easy",
      summary: text.slice(0, 80),
      reason: "Criação de filtro salvo.",
      estimated_credits: 1,
      configuration_json: { name: text.slice(0, 60), filters: { search: "" } },
    };
  }

  // Default: advanced — sends to admin queue rather than getting stuck
  return {
    type: "other",
    complexity: "advanced",
    summary: text.slice(0, 80),
    reason: "Não foi possível classificar automaticamente — enviado para revisão.",
    estimated_credits: 5,
    configuration_json: {},
  };
}

// ----- Local category rule builder -----------------------------------------

function extractCategoryName(text: string): string {
  // "categoria X", "como X", "= X", quoted strings
  const patterns = [
    /categoria\s+["']([^"']{1,60})["']/i,
    /categoria\s+([A-Za-zÀ-ÿ][\wÀ-ÿ\s\-]{0,59})/i,
    /(?:como|=|virar?)\s+["']([^"']{1,60})["']/i,
    /(?:como|=|virar?)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ\s\-]{0,59})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      return m[1]
        .trim()
        .replace(/\.$/, "")
        .replace(/\s+(se|quando|caso)\s+.*$/i, "")
        .trim();
    }
  }
  return "Categoria automática";
}

function buildLocalCategoryRule(text: string): LocalClassification {
  const t = text.toLowerCase();
  const transaction_type: "income" | "expense" = /receb|positiv|entrad|receit|venda|ganho/i.test(t)
    ? "income"
    : "expense";

  const conditions: RuleCondition[] = [];
  let detected = "";

  // Amount equals / multiple_of: "valor de 290", "290 reais", "múltiplo de 290"
  const amountMatch = text.match(/\b(?:R\$\s*)?(\d{1,7}(?:[\.,]\d{1,2})?)\s*(?:reais?)?\b/);
  const wantsMultiple = /m[uú]ltipl|m[uú]ltipo/i.test(t);
  if (amountMatch) {
    const v = parseFloat(amountMatch[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(v) && v > 0) {
      conditions.push({
        kind: "amount",
        operator: wantsMultiple ? "multiple_of" : "equals",
        value: v,
      });
      detected += wantsMultiple ? `valor múltiplo de ${v}` : `valor ${v}`;
    }
  }

  // Recurrence: "todo mês", "mensalmente", "repetidas", "refeita(s)"
  if (/todo\s+m[eê]s|mensal|recorrent|repet|refeit/i.test(t)) {
    const basis: "descriptor" | "counterparty" =
      /mesma pessoa|mesmo pagador|mesmo cliente|mesmo remetente|mesmo nome/i.test(t)
        ? "counterparty"
        : "descriptor";
    conditions.push({ kind: "recurrence", basis, min_count: 2, window_days: 90 });
    detected += (detected ? " + " : "") + `recorrência (${basis})`;
  }

  // Descriptor / counterparty literal — "contendo X", "com o nome Y"
  const descMatch = text.match(
    /(?:contendo|com\s+(?:o\s+)?(?:descritivo|nome|texto))\s+["']?([^"'\n]{2,40})["']?/i,
  );
  if (descMatch) {
    const v = descMatch[1].trim().replace(/[\.,]$/, "");
    conditions.push({ kind: "descriptor", match_text: v, match_mode: "contains" });
    detected += (detected ? " + " : "") + `descritivo "${v}"`;
  }

  // If we still have no condition, mark advanced rather than create a useless rule.
  if (conditions.length === 0) {
    return {
      type: "other",
      complexity: "advanced",
      summary: text.slice(0, 80),
      reason: "Regra de categorização sem critério claro — enviado para revisão.",
      estimated_credits: 3,
      configuration_json: { original_text: text },
    };
  }

  const category_name = extractCategoryName(text);
  const rule: CategoryRule = { category_name, transaction_type, conditions };
  return {
    type: "category_rule",
    complexity: "easy",
    summary: `Regra: ${detected} → ${category_name}`,
    reason: "Regra de categorização automática.",
    estimated_credits: 1,
    configuration_json: { rule },
  };
}

async function tryAiInterpret(
  requestText: string,
  signal?: AbortSignal,
): Promise<LocalClassification | null> {
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

// ============================================================
// Security matrix + persistence
// ============================================================

/** Reads the caller's role in the workspace (never trusted from the client). */
async function getMemberRole(
  supabase: any,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

type ApplyDecision = {
  applicable: boolean;
  reason: string;
  type: string;
  configuration_json: Record<string, any>;
};

/**
 * Decides whether an interpretation can be applied automatically.
 * Validation is strict (Zod, whitelist only); anything else is queued.
 */
function decideApplication(
  interp: LocalClassification,
  scope: TargetScope,
  role: string | null,
): ApplyDecision {
  if (interp.type === "calculation" || interp.type === "new_calculation") {
    return {
      applicable: false,
      reason: CALCULATION_REVIEW_MESSAGE,
      type: interp.type,
      configuration_json: {},
    };
  }
  const validation = validateAutoOperation({
    type: interp.type,
    configuration_json: interp.configuration_json,
  });
  if (!validation.ok) {
    return {
      applicable: false,
      reason: validation.reason,
      type: interp.type,
      configuration_json: interp.configuration_json ?? {},
    };
  }
  if (interp.complexity !== "easy") {
    return {
      applicable: false,
      reason: interp.reason || "Pedido classificado como avançado.",
      type: validation.type,
      configuration_json: validation.configuration_json,
    };
  }
  if (!canAutoApply(scope, role)) {
    return {
      applicable: false,
      reason:
        "Mudanças para todo o workspace só podem ser aplicadas pelo proprietário — enviado para revisão.",
      type: validation.type,
      configuration_json: validation.configuration_json,
    };
  }
  return {
    applicable: true,
    reason: interp.reason,
    type: validation.type,
    configuration_json: validation.configuration_json,
  };
}

async function applyAndPersist(
  supabase: any,
  workspaceId: string,
  userId: string,
  requestText: string,
  interp: LocalClassification,
  scope: TargetScope,
  role: string | null,
) {
  const decision = decideApplication(interp, scope, role);
  const isApplicable = decision.applicable;
  const safeInterp: LocalClassification = {
    ...interp,
    type: decision.type,
    reason: decision.reason,
    configuration_json: decision.configuration_json,
    complexity: isApplicable ? "easy" : "advanced",
  };

  const finalStatus = isApplicable ? "testing" : "needs_admin_review";
  const { data: inserted, error } = await supabase
    .from("customization_requests")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      request_text: requestText,
      request_type: isApplicable ? "simple" : "advanced",
      complexity: safeInterp.complexity,
      ai_classification_reason: decision.reason,
      estimated_credits: safeInterp.estimated_credits,
      status: finalStatus,
      ai_interpretation: safeInterp,
      auto_applied: isApplicable,
      target_scope: scope,
      target_user_id: scope === "user" ? userId : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Credits are NOT consumed here — they are charged once, on approval.
  if (!isApplicable) {
    return { request: inserted, autoApplied: false as const, reason: decision.reason };
  }

  const { data: cust, error: cErr } = await supabase
    .from("customizations")
    .insert({
      workspace_id: workspaceId,
      type: safeInterp.type,
      name: (safeInterp.summary || requestText).slice(0, 80) || "Personalização",
      description: safeInterp.summary || null,
      configuration_json: safeInterp.configuration_json,
      created_by: userId,
      request_id: inserted.id,
      is_active: true,
      is_testing: true,
      target_scope: scope,
      target_user_id: scope === "user" ? userId : null,
      menu_key:
        safeInterp.type === "label_rename"
          ? (Object.keys(safeInterp.configuration_json?.labels ?? {})[0] ?? null)
          : null,
      operation_type: safeInterp.type,
      operation_payload: safeInterp.configuration_json,
    })
    .select()
    .single();

  if (cErr) {
    await supabase
      .from("customization_requests")
      .update({
        status: "needs_admin_review",
        auto_applied: false,
        ai_classification_reason: `Falha ao aplicar: ${cErr.message}`,
      })
      .eq("id", inserted.id);
    return { request: { ...inserted, status: "needs_admin_review" }, autoApplied: false as const };
  }

  await supabase
    .from("customization_requests")
    .update({
      applied_customization_id: cust.id,
      tested_at: new Date().toISOString(),
      rollback_payload: { kind: "delete_customization", customization_id: cust.id },
    })
    .eq("id", inserted.id);

  return {
    request: { ...inserted, applied_customization_id: cust.id, status: "testing" },
    autoApplied: true as const,
  };
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

    const role = await getMemberRole(supabase as any, data.workspace_id, userId);
    if (!role) throw new Error("Forbidden");
    const scope: TargetScope = data.target_scope === "workspace" ? "workspace" : "user";

    // 1) Local classification (always works)
    const local = classifyLocally(data.request_text);

    // 2) Try AI enhancement with 8s timeout — best effort, never blocks.
    //    The AI output is only a suggestion; it is validated before use.
    let interp = local;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const ai = await tryAiInterpret(data.request_text, ctrl.signal);
      clearTimeout(timer);
      if (ai) {
        const aiValid = validateAutoOperation({
          type: ai.type,
          configuration_json: ai.configuration_json,
        });
        // Prefer the AI reading only when it is strictly valid; otherwise keep
        // the deterministic local result (which may itself route to review).
        if (aiValid.ok) interp = ai;
      }
    } catch {
      // keep local
    }

    return await applyAndPersist(
      supabase as any,
      data.workspace_id,
      userId,
      data.request_text,
      interp,
      scope,
      role,
    );
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

    const role = await getMemberRole(supabase as any, data.workspace_id, userId);
    if (!role) throw new Error("Forbidden");

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
    for (const row of stuck ?? []) {
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

      const rowScope: TargetScope = row.target_scope === "user" ? "user" : "workspace";
      const rowRole =
        row.user_id === userId ? role : await getMemberRole(supabase as any, row.workspace_id, row.user_id);
      const decision = decideApplication(interp, rowScope, rowRole);
      const isApplicable = decision.applicable;
      const safeInterp: LocalClassification = {
        ...interp,
        type: decision.type,
        reason: decision.reason,
        configuration_json: decision.configuration_json,
        complexity: isApplicable ? "easy" : "advanced",
      };
      const finalStatus = isApplicable ? "testing" : "needs_admin_review";

      // Idempotency: never create a second customization for the same request.
      let appliedCustId: string | null = row.applied_customization_id ?? null;
      if (!appliedCustId) {
        const { data: prior } = await (supabase as any)
          .from("customizations")
          .select("id")
          .eq("request_id", row.id)
          .maybeSingle();
        appliedCustId = prior?.id ?? null;
      }
      if (isApplicable && !appliedCustId) {
        const { data: cust } = await (supabase as any)
          .from("customizations")
          .insert({
            workspace_id: row.workspace_id,
            type: safeInterp.type,
            name: (safeInterp.summary || row.request_text).slice(0, 80) || "Personalização",
            description: safeInterp.summary || null,
            configuration_json: safeInterp.configuration_json,
            created_by: row.user_id,
            request_id: row.id,
            is_active: true,
            is_testing: true,
            target_scope: rowScope,
            target_user_id: rowScope === "user" ? row.target_user_id || row.user_id : null,
            operation_type: safeInterp.type,
            operation_payload: safeInterp.configuration_json,
            menu_key:
              safeInterp.type === "label_rename"
                ? (Object.keys(safeInterp.configuration_json?.labels ?? {})[0] ?? null)
                : null,
          })
          .select()
          .single();
        appliedCustId = cust?.id ?? null;
      }

      const now = new Date().toISOString();
      await (supabase as any)
        .from("customization_requests")
        .update({
          status: finalStatus,
          complexity: safeInterp.complexity,
          request_type: isApplicable ? "simple" : "advanced",
          ai_classification_reason: decision.reason,
          ai_interpretation: safeInterp,
          auto_applied: isApplicable,
          applied_customization_id: isApplicable ? appliedCustId : null,
          tested_at: isApplicable ? now : null,
          rollback_payload:
            isApplicable && appliedCustId
              ? { kind: "delete_customization", customization_id: appliedCustId }
              : null,
          approved_at: null,
          completed_at: null,
        })
        .eq("id", row.id);

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
