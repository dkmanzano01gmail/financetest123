import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { registryAsPromptFragment, type CategoryRule, type RuleCondition } from "@/lib/customization-registry";

const InterpretInput = z.object({
  workspace_id: z.string().uuid(),
  request_text: z.string().min(3).max(2000),
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
  "novo módulo", "novo modulo", "nova tela",
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

  // Category rule — rich detection (descriptor / amount / recurrence / counterparty)
  const looksLikeRule =
    /sempre que|toda(?:s)? (?:as )?transaç|categoriz|classificar como|considerar? como|considere|pode considerar/i.test(t);
  if (looksLikeRule) {
    return buildLocalCategoryRule(text);
  }

  // Hide/show menu tab (nav_visibility) — must be checked before card_visibility
  // because "esconder aba contas" mentions both "esconder" and a nav key.
  if (/(ocultar|esconder|tirar|remover|mostrar|exibir)/i.test(t) && /(aba|menu|item do menu|sidebar|t[aá]b)/i.test(t)) {
    const visible = /mostrar|exibir/i.test(t);
    const key = detectNavKey(t);
    if (key) {
      return {
        type: "nav_visibility", complexity: "easy",
        summary: `${visible ? "Mostrar" : "Ocultar"} aba "${key}"`,
        reason: "Visibilidade de item de menu.",
        estimated_credits: 1,
        configuration_json: { menu_key: key, visible },
      };
    }
  }

  // Reorder menu: "colocar X antes de Y", "mover X para o topo/início/fim"
  if (/(reorden|coloc(ar|ue)|mover|mude\s+a\s+ordem|trocar\s+a\s+ordem|antes\s+de|depois\s+de|para\s+(o\s+)?(topo|in[ií]cio|fim))/i.test(t)) {
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
        type: "nav_reorder", complexity: "easy",
        summary: `Reordenar menu: ${order.join(" → ")}`,
        reason: "Reordenação parcial do menu (demais itens preservados).",
        estimated_credits: 2,
        configuration_json: { order },
      };
    }
  }

  // Hide/show dashboard card
  if (/(ocultar|esconder|tirar|remover|mostrar|exibir)/i.test(t) && /(card|widget|gr[aá]fico|bloco|painel|caixa)/i.test(t)) {
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
        type: "card_visibility", complexity: "easy",
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
      return m[1].trim()
        .replace(/\.$/, "")
        .replace(/\s+(se|quando|caso)\s+.*$/i, "")
        .trim();
    }
  }
  return "Categoria automática";
}

function buildLocalCategoryRule(text: string): LocalClassification {
  const t = text.toLowerCase();
  const transaction_type: "income"|"expense" =
    /receb|positiv|entrad|receit|venda|ganho/i.test(t) ? "income" : "expense";

  const conditions: RuleCondition[] = [];
  let detected = "";

  // Amount equals / multiple_of: "valor de 290", "290 reais", "múltiplo de 290"
  const amountMatch = text.match(/\b(?:R\$\s*)?(\d{1,7}(?:[\.,]\d{1,2})?)\s*(?:reais?)?\b/);
  const wantsMultiple = /m[uú]ltipl|m[uú]ltipo/i.test(t);
  if (amountMatch) {
    const v = parseFloat(amountMatch[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(v) && v > 0) {
      conditions.push({ kind: "amount", operator: wantsMultiple ? "multiple_of" : "equals", value: v });
      detected += wantsMultiple ? `valor múltiplo de ${v}` : `valor ${v}`;
    }
  }

  // Recurrence: "todo mês", "mensalmente", "repetidas", "refeita(s)"
  if (/todo\s+m[eê]s|mensal|recorrent|repet|refeit/i.test(t)) {
    const basis: "descriptor"|"counterparty" =
      /mesma pessoa|mesmo pagador|mesmo cliente|mesmo remetente|mesmo nome/i.test(t)
        ? "counterparty" : "descriptor";
    conditions.push({ kind: "recurrence", basis, min_count: 2, window_days: 90 });
    detected += (detected ? " + " : "") + `recorrência (${basis})`;
  }

  // Descriptor / counterparty literal — "contendo X", "com o nome Y"
  const descMatch = text.match(/(?:contendo|com\s+(?:o\s+)?(?:descritivo|nome|texto))\s+["']?([^"'\n]{2,40})["']?/i);
  if (descMatch) {
    const v = descMatch[1].trim().replace(/[\.,]$/, "");
    conditions.push({ kind: "descriptor", match_text: v, match_mode: "contains" });
    detected += (detected ? " + " : "") + `descritivo "${v}"`;
  }

  // If we still have no condition, mark advanced rather than create a useless rule.
  if (conditions.length === 0) {
    return {
      type: "other", complexity: "advanced",
      summary: text.slice(0, 80),
      reason: "Regra de categorização sem critério claro — enviado para revisão.",
      estimated_credits: 3, configuration_json: { original_text: text },
    };
  }

  const category_name = extractCategoryName(text);
  const rule: CategoryRule = { category_name, transaction_type, conditions };
  return {
    type: "category_rule", complexity: "easy",
    summary: `Regra: ${detected} → ${category_name}`,
    reason: "Regra de categorização automática.",
    estimated_credits: 1,
    configuration_json: { rule },
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
  "label_rename", "card_visibility", "nav_visibility", "nav_reorder",
  "dashboard_widget_order", "category_rule", "saved_filter", "new_category",
]);

/**
 * Persists a CategoryRule as importance_rules rows and applies it
 * retroactively to existing transactions. Returns the new rule id +
 * number of transactions affected.
 */
async function applyCategoryRule(
  supabase: any,
  workspaceId: string,
  rule: CategoryRule,
): Promise<{ rule_id: string | null; category_id: string | null; affected: number; created_category: boolean }> {
  // 1) Resolve category — create if missing
  let { data: cat } = await supabase
    .from("categories")
    .select("id,name,type,importance_level")
    .eq("workspace_id", workspaceId)
    .ilike("name", rule.category_name)
    .maybeSingle();
  let createdCategory = false;
  if (!cat) {
    const { data: newCat, error: cErr } = await supabase.from("categories").insert({
      workspace_id: workspaceId,
      name: rule.category_name,
      type: rule.transaction_type ?? "expense",
      color: rule.transaction_type === "income" ? "#16a34a" : "#c2410c",
      importance_level: rule.importance_level ?? "flexible",
    }).select("id,name,type,importance_level").single();
    if (cErr) throw new Error(cErr.message);
    cat = newCat;
    createdCategory = true;
  }

  // 2) Build importance_rules row from conditions (AND)
  const desc = rule.conditions.find((c) => c.kind === "descriptor") as Extract<RuleCondition,{kind:"descriptor"}> | undefined;
  const cp = rule.conditions.find((c) => c.kind === "counterparty") as Extract<RuleCondition,{kind:"counterparty"}> | undefined;
  const amt = rule.conditions.find((c) => c.kind === "amount") as Extract<RuleCondition,{kind:"amount"}> | undefined;
  const rec = rule.conditions.find((c) => c.kind === "recurrence") as Extract<RuleCondition,{kind:"recurrence"}> | undefined;

  const ruleRow: Record<string, any> = {
    workspace_id: workspaceId,
    rule_kind: rule.conditions.length > 1 ? "composite" : (rule.conditions[0]?.kind ?? "descriptor"),
    match_text: desc?.match_text ?? "",
    match_mode: desc?.match_mode ?? "contains",
    category_hint: cat?.name ?? rule.category_name,
    category_id: cat?.id ?? null,
    importance_level: rule.importance_level ?? cat?.importance_level ?? "flexible",
    transaction_type: rule.transaction_type ?? null,
    source_type: "user",
    confidence: 0.95,
    is_active: true,
    amount_operator: amt?.operator ?? null,
    amount_value: amt?.value ?? null,
    amount_value_2: amt?.value2 ?? null,
    counterparty_match: cp?.match_text ?? null,
    counterparty_match_mode: cp?.match_mode ?? (cp ? "contains" : null),
    recurrence_min_count: rec?.min_count ?? null,
    recurrence_window_days: rec?.window_days ?? null,
    priority: rule.priority ?? 50,
    notes: rule.notes ?? null,
  };

  const { data: insertedRule, error: rErr } = await supabase
    .from("importance_rules").insert(ruleRow).select("id").single();
  if (rErr) throw new Error(rErr.message);

  // 3) Retroactive apply — fetch matching transactions and update.
  //    We re-evaluate in JS so the same matcher used by the suggestion
  //    engine governs both new and historical txns.
  const { data: txs } = await supabase
    .from("transactions")
    .select("id,description,counterparty,amount,date,type,category_id")
    .eq("workspace_id", workspaceId)
    .limit(5000);
  const matched: string[] = [];
  for (const tx of (txs ?? [])) {
    if (rule.transaction_type && tx.type !== rule.transaction_type) continue;
    if (!matchesRuleLocally(tx, ruleRow, txs ?? [])) continue;
    matched.push(tx.id);
  }
  if (matched.length > 0 && cat?.id) {
    // Update in chunks of 200 to avoid huge IN clauses
    for (let i = 0; i < matched.length; i += 200) {
      const chunk = matched.slice(i, i + 200);
      await supabase.from("transactions").update({
        category_id: cat.id,
        importance_level: ruleRow.importance_level,
        importance_suggestion_reason: `Regra "${rule.category_name}" aplicada automaticamente.`,
        importance_status: "suggested",
      }).in("id", chunk);
    }
  }

  return { rule_id: insertedRule?.id ?? null, category_id: cat?.id ?? null, affected: matched.length, created_category: createdCategory };
}

function normalizeStr(s: string | null | undefined): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function matchesRuleLocally(tx: any, r: any, allTxs: any[]): boolean {
  // descriptor
  if (r.match_text && String(r.match_text).trim()) {
    const txt = normalizeStr(`${tx.description ?? ""} ${tx.counterparty ?? ""}`);
    const m = normalizeStr(r.match_text);
    let ok = false;
    if (r.match_mode === "equals") ok = txt === m;
    else if (r.match_mode === "starts_with") ok = txt.startsWith(m);
    else if (r.match_mode === "regex") { try { ok = new RegExp(m, "i").test(txt); } catch { ok = false; } }
    else ok = txt.includes(m);
    if (!ok) return false;
  }
  // counterparty
  if (r.counterparty_match) {
    const cp = normalizeStr(tx.counterparty);
    const m = normalizeStr(r.counterparty_match);
    const mode = r.counterparty_match_mode ?? "contains";
    let ok = false;
    if (mode === "equals") ok = cp === m;
    else if (mode === "starts_with") ok = cp.startsWith(m);
    else ok = cp.includes(m);
    if (!ok) return false;
  }
  // amount
  if (r.amount_operator && r.amount_value != null) {
    const a = Math.abs(Number(tx.amount));
    const v = Math.abs(Number(r.amount_value));
    let ok = false;
    if (r.amount_operator === "equals") ok = Math.abs(a - v) < 0.005;
    else if (r.amount_operator === "multiple_of") ok = v > 0 && Math.abs((a / v) - Math.round(a / v)) < 0.005;
    else if (r.amount_operator === "greater_than") ok = a > v;
    else if (r.amount_operator === "less_than") ok = a < v;
    else if (r.amount_operator === "between") {
      const v2 = Math.abs(Number(r.amount_value_2 ?? v));
      const lo = Math.min(v, v2), hi = Math.max(v, v2);
      ok = a >= lo && a <= hi;
    }
    if (!ok) return false;
  }
  // recurrence
  if (r.recurrence_min_count) {
    const basisDescriptor = !r.counterparty_match;
    const windowDays = r.recurrence_window_days ?? 90;
    const cutoff = Date.now() - windowDays * 86_400_000;
    const subjectText = normalizeStr(tx.description);
    const subjectCp = normalizeStr(tx.counterparty);
    let count = 0;
    for (const other of allTxs) {
      if (other.id === tx.id) continue;
      if (other.date) {
        const d = Date.parse(other.date);
        if (!Number.isNaN(d) && d < cutoff) continue;
      }
      if (basisDescriptor) {
        const od = normalizeStr(other.description);
        if (od && (od === subjectText || od.includes(subjectText) || subjectText.includes(od))) count++;
      } else {
        const oc = normalizeStr(other.counterparty);
        if (oc && (oc === subjectCp || oc.includes(subjectCp) || subjectCp.includes(oc))) count++;
      }
      if (count + 1 >= r.recurrence_min_count) return true;
    }
    return false;
  }
  return true;
}

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

  // category_rule: persist as importance_rules + apply retroactively
  let ruleResult: { rule_id: string | null; category_id: string | null; affected: number; created_category: boolean } | null = null;
  if (interp.type === "category_rule") {
    const rule = (interp.configuration_json as any)?.rule as CategoryRule | undefined;
    if (rule && Array.isArray(rule.conditions) && rule.conditions.length > 0) {
      try {
        ruleResult = await applyCategoryRule(supabase, workspaceId, rule);
        if (ruleResult.created_category && ruleResult.category_id) createdCategoryId = ruleResult.category_id;
      } catch (err) {
        console.error("applyCategoryRule failed:", err);
      }
    }
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
      is_testing: true,
      menu_key: interp.type === "label_rename"
        ? Object.keys(interp.configuration_json?.labels ?? {})[0] ?? null
        : null,
      operation_type: interp.type,
      operation_payload: ruleResult
        ? { ...interp.configuration_json, applied_rule_id: ruleResult.rule_id, affected_transactions: ruleResult.affected }
        : interp.configuration_json,
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
  if (ruleResult?.rule_id) rollback.importance_rule_id = ruleResult.rule_id;

  await supabase.from("customization_requests")
    .update({
      applied_customization_id: cust.id,
      approved_credits: interp.estimated_credits,
      tested_at: now,
      rollback_payload: rollback,
    })
    .eq("id", inserted.id);

  return {
    request: { ...inserted, applied_customization_id: cust.id, status: "testing" },
    autoApplied: true as const,
    affected_transactions: ruleResult?.affected ?? 0,
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
          is_testing: true,
          menu_key: interp.type === "label_rename"
            ? Object.keys(interp.configuration_json?.labels ?? {})[0] ?? null
            : null,
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
