import { supabase } from "@/integrations/supabase/client";

export type Importance = "essential" | "important" | "flexible" | "superfluous";

export type SuggestionInput = {
  id: string;
  description: string;
  counterparty?: string | null;
  type: "income" | "expense";
  amount: number;
  category_id?: string | null;
  importance_level?: Importance | null;
};

export type Suggestion = {
  transaction_id: string;
  category_id: string | null;
  category_name: string | null;
  importance: Importance;
  confidence: number;
  reason: string;
  source: "history" | "rule" | "category" | "fallback";
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  importance_level: Importance;
  importance_comment?: string | null;
};

type Rule = {
  match_text: string;
  match_mode: "contains" | "equals" | "starts_with" | "regex";
  category_hint: string | null;
  category_id: string | null;
  importance_level: Importance;
  transaction_type: "income" | "expense" | null;
  workspace_type: "personal" | "business" | null;
  confidence: number;
  source_type: "system" | "user" | "learned";
};

type HistoryEntry = {
  description: string;
  category_id: string | null;
  importance_level: Importance | null;
};

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ruleMatches(text: string, r: Rule): boolean {
  const m = normalize(r.match_text);
  if (!m) return false;
  if (r.match_mode === "equals") return text === m;
  if (r.match_mode === "starts_with") return text.startsWith(m);
  if (r.match_mode === "regex") {
    try { return new RegExp(m, "i").test(text); } catch { return false; }
  }
  return text.includes(m);
}

function similarHistory(text: string, history: HistoryEntry[]): HistoryEntry | null {
  // Try token overlap to detect e.g. "IFOOD SAO PAULO" vs "IFOOD"
  const tokens = text.split(" ").filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  let best: { entry: HistoryEntry; score: number } | null = null;
  for (const h of history) {
    if (!h.importance_level || !h.category_id) continue;
    const hn = normalize(h.description);
    if (!hn) continue;
    let score = 0;
    for (const t of tokens) if (hn.includes(t)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { entry: h, score };
  }
  return best?.entry ?? null;
}

export async function loadSuggestionContext(workspaceId: string, workspaceType: "personal" | "business") {
  const [{ data: cats }, { data: rules }, { data: hist }] = await Promise.all([
    supabase.from("categories").select("id,name,type,importance_level,importance_comment" as any).eq("workspace_id", workspaceId).eq("is_active", true),
    (supabase as any).from("importance_rules").select("match_text,match_mode,category_hint,category_id,importance_level,transaction_type,workspace_type,confidence,source_type").eq("is_active", true).or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`),
    supabase.from("transactions").select("description,category_id,importance_level" as any).eq("workspace_id", workspaceId).not("category_id", "is", null).not("importance_level", "is", null).order("created_at", { ascending: false }).limit(500),
  ]);
  return {
    categories: ((cats as any[]) ?? []) as Category[],
    rules: (((rules as any[]) ?? []) as Rule[]).filter((r) => !r.workspace_type || r.workspace_type === workspaceType),
    history: ((hist as any[]) ?? []) as HistoryEntry[],
  };
}

export function suggestForTransaction(
  tx: SuggestionInput,
  ctx: { categories: Category[]; rules: Rule[]; history: HistoryEntry[] }
): Suggestion {
  const text = normalize(`${tx.description ?? ""} ${tx.counterparty ?? ""}`);
  const catsByName = new Map<string, Category>();
  ctx.categories.forEach((c) => catsByName.set(normalize(c.name), c));
  const catsById = new Map<string, Category>();
  ctx.categories.forEach((c) => catsById.set(c.id, c));

  // 1) History
  const h = similarHistory(text, ctx.history);
  if (h && h.category_id && h.importance_level) {
    const cat = catsById.get(h.category_id);
    if (cat && cat.type === tx.type) {
      return {
        transaction_id: tx.id,
        category_id: cat.id,
        category_name: cat.name,
        importance: h.importance_level,
        confidence: 0.9,
        reason: `Descrição parecida com transações anteriores marcadas como ${cat.name} e ${labelImp(h.importance_level)}.`,
        source: "history",
      };
    }
  }

  // 2) Rules (highest confidence wins, type-matching)
  let bestRule: Rule | null = null;
  for (const r of ctx.rules) {
    if (r.transaction_type && r.transaction_type !== tx.type) continue;
    if (!ruleMatches(text, r)) continue;
    if (!bestRule || r.confidence > bestRule.confidence) bestRule = r;
  }
  if (bestRule) {
    let cat: Category | null = null;
    if (bestRule.category_id) cat = catsById.get(bestRule.category_id) ?? null;
    if (!cat && bestRule.category_hint) cat = catsByName.get(normalize(bestRule.category_hint)) ?? null;
    if (cat && cat.type !== tx.type) cat = null;
    return {
      transaction_id: tx.id,
      category_id: cat?.id ?? null,
      category_name: cat?.name ?? bestRule.category_hint ?? null,
      importance: bestRule.importance_level,
      confidence: bestRule.confidence,
      reason: `Palavra-chave "${bestRule.match_text}" sugere ${cat?.name ?? bestRule.category_hint ?? "categoria"} (${labelImp(bestRule.importance_level)}).`,
      source: "rule",
    };
  }

  // 3) Existing category default
  if (tx.category_id) {
    const cat = catsById.get(tx.category_id);
    if (cat) {
      return {
        transaction_id: tx.id,
        category_id: cat.id,
        category_name: cat.name,
        importance: cat.importance_level,
        confidence: 0.5,
        reason: `Importância padrão da categoria ${cat.name}.`,
        source: "category",
      };
    }
  }

  // 4) Fallback
  return {
    transaction_id: tx.id,
    category_id: null,
    category_name: null,
    importance: "flexible",
    confidence: 0.2,
    reason: "Sem regra ou histórico correspondente — marcado como Flexível por padrão.",
    source: "fallback",
  };
}

export function labelImp(i: Importance): string {
  return i === "essential" ? "Essencial" : i === "important" ? "Importante" : i === "flexible" ? "Flexível" : "Supérfluo";
}

export function importanceBadgeClass(i: Importance): string {
  return i === "essential" ? "bg-emerald-100 text-emerald-800"
    : i === "important" ? "bg-sky-100 text-sky-800"
    : i === "flexible" ? "bg-amber-100 text-amber-800"
    : "bg-rose-100 text-rose-800";
}