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
  importance_confirmed_by_user?: boolean | null;
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
  rule_kind?: "descriptor"|"amount"|"counterparty"|"recurrence"|"composite";
  match_text: string;
  match_mode: "contains" | "equals" | "starts_with" | "regex";
  category_hint: string | null;
  category_id: string | null;
  importance_level: Importance;
  transaction_type: "income" | "expense" | null;
  workspace_type: "personal" | "business" | null;
  confidence: number;
  source_type: "system" | "user" | "learned";
  amount_operator?: "equals"|"multiple_of"|"between"|"greater_than"|"less_than" | null;
  amount_value?: number | null;
  amount_value_2?: number | null;
  counterparty_match?: string | null;
  counterparty_match_mode?: "contains"|"equals"|"starts_with" | null;
  recurrence_min_count?: number | null;
  recurrence_window_days?: number | null;
  priority?: number | null;
};

type HistoryEntry = {
  description: string;
  counterparty?: string | null;
  category_id: string | null;
  importance_level: Importance | null;
  date?: string | null;
  amount?: number | null;
};

export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Common Nubank/bank prefixes that add no signal.
    .replace(/\b(compra no debito|compra no débito|pagamento efetuado|pix\s+(enviado|recebido)|transferencia\s+(enviada|recebida)|debito automatico|débito automático)\b/g, " ")
    // Masked card suffixes / transaction IDs / trailing UUID-ish tokens.
    .replace(/\b(final\s+\d{2,4}|xxxx\d{2,4}|\*{2,}\d{2,4})\b/g, " ")
    .replace(/\b[a-f0-9]{16,}\b/g, " ")
    // Punctuation → spaces so tokens split cleanly.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
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

function counterpartyMatches(cp: string, r: Rule): boolean {
  const m = normalize(r.counterparty_match ?? "");
  if (!m) return false;
  const mode = r.counterparty_match_mode ?? "contains";
  if (mode === "equals") return cp === m;
  if (mode === "starts_with") return cp.startsWith(m);
  return cp.includes(m);
}

function amountMatches(amount: number, r: Rule): boolean {
  const op = r.amount_operator;
  const v = r.amount_value;
  if (!op || v === null || v === undefined) return false;
  const a = Math.abs(amount);
  const vv = Math.abs(Number(v));
  if (op === "equals") return Math.abs(a - vv) < 0.005;
  if (op === "multiple_of") return vv > 0 && Math.abs((a / vv) - Math.round(a / vv)) < 0.005;
  if (op === "greater_than") return a > vv;
  if (op === "less_than") return a < vv;
  if (op === "between") {
    const v2 = Math.abs(Number(r.amount_value_2 ?? v));
    const lo = Math.min(vv, v2), hi = Math.max(vv, v2);
    return a >= lo && a <= hi;
  }
  return false;
}

/** Returns true when the descriptor (or counterparty) repeats N times in the window. */
function recurrenceMatches(
  tx: SuggestionInput,
  r: Rule,
  history: HistoryEntry[],
): boolean {
  const minCount = r.recurrence_min_count ?? 2;
  const windowDays = r.recurrence_window_days ?? 90;
  const basisDescriptor = !r.counterparty_match;
  const cutoff = Date.now() - windowDays * 86_400_000;
  const subjectText = normalize(tx.description ?? "");
  const subjectCp = normalize(tx.counterparty ?? "");
  if (!subjectText && !subjectCp) return false;
  let count = 0;
  for (const h of history) {
    if (h.date) {
      const t = Date.parse(h.date);
      if (!Number.isNaN(t) && t < cutoff) continue;
    }
    if (basisDescriptor) {
      const hd = normalize(h.description ?? "");
      if (hd && (hd === subjectText || hd.includes(subjectText) || subjectText.includes(hd))) count++;
    } else {
      const hc = normalize(h.counterparty ?? "");
      if (hc && (hc === subjectCp || hc.includes(subjectCp) || subjectCp.includes(hc))) count++;
    }
    if (count >= minCount) return true;
  }
  return false;
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
  const [catsRes, rulesRes, histRes] = await Promise.all([
    supabase.from("categories")
      .select("id,name,type,importance_level,importance_comment" as any)
      .eq("workspace_id", workspaceId).eq("is_active", true),
    (supabase as any).from("importance_rules")
      .select("rule_kind,match_text,match_mode,category_hint,category_id,importance_level,transaction_type,workspace_type,confidence,source_type,amount_operator,amount_value,amount_value_2,counterparty_match,counterparty_match_mode,recurrence_min_count,recurrence_window_days,priority")
      .eq("is_active", true)
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order("priority", { ascending: true }),
    supabase.from("transactions")
      .select("description,counterparty,date,amount,category_id,importance_level" as any)
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false }).limit(800),
  ]);
  if (catsRes.error) throw catsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (histRes.error) throw histRes.error;
  return {
    categories: ((catsRes.data as any[]) ?? []) as Category[],
    rules: (((rulesRes.data as any[]) ?? []) as Rule[]).filter((r) => !r.workspace_type || r.workspace_type === workspaceType),
    history: ((histRes.data as any[]) ?? []) as HistoryEntry[],
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
  let bestRuleScore = -1;
  for (const r of ctx.rules) {
    if (r.transaction_type && r.transaction_type !== tx.type) continue;
    const kind = r.rule_kind ?? "descriptor";
    const hasDesc = !!(r.match_text && r.match_text.trim());
    const hasAmount = !!r.amount_operator;
    const hasCp = !!(r.counterparty_match && r.counterparty_match.trim());
    const hasRec = !!r.recurrence_min_count;
    let ok = true;
    if (hasDesc) ok = ok && ruleMatches(text, r);
    if (ok && hasAmount) ok = ok && amountMatches(tx.amount, r);
    if (ok && hasCp) ok = ok && counterpartyMatches(normalize(tx.counterparty ?? ""), r);
    if (ok && hasRec) ok = ok && recurrenceMatches(tx, r, ctx.history);
    if (!ok) continue;
    // Score: more matched dimensions = more specific = wins.
    const dims = (hasDesc?1:0) + (hasAmount?1:0) + (hasCp?1:0) + (hasRec?1:0);
    const score = dims * 10 + r.confidence - (r.priority ?? 100) / 1000;
    if (score > bestRuleScore) { bestRule = r; bestRuleScore = score; }
    void kind;
  }
  if (bestRule) {
    let cat: Category | null = null;
    if (bestRule.category_id) cat = catsById.get(bestRule.category_id) ?? null;
    if (!cat && bestRule.category_hint) cat = catsByName.get(normalize(bestRule.category_hint)) ?? null;
    if (cat && cat.type !== tx.type) cat = null;
    const reasonBits: string[] = [];
    if (bestRule.match_text) reasonBits.push(`descritivo "${bestRule.match_text}"`);
    if (bestRule.amount_operator) reasonBits.push(`valor ${bestRule.amount_operator} ${bestRule.amount_value}`);
    if (bestRule.counterparty_match) reasonBits.push(`pessoa "${bestRule.counterparty_match}"`);
    if (bestRule.recurrence_min_count) reasonBits.push(`recorrência ≥${bestRule.recurrence_min_count}/${bestRule.recurrence_window_days}d`);
    return {
      transaction_id: tx.id,
      category_id: cat?.id ?? null,
      category_name: cat?.name ?? bestRule.category_hint ?? null,
      importance: bestRule.importance_level,
      confidence: bestRule.confidence,
      reason: `Regra (${reasonBits.join(" + ") || "match"}) → ${cat?.name ?? bestRule.category_hint ?? "categoria"} (${labelImp(bestRule.importance_level)}).`,
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

  // 4) Category comment / name token match (same transaction type only).
  const txTokens = new Set(text.split(" ").filter((tk) => tk.length >= 3));
  let bestCat: { cat: Category; score: number; matched: string[] } | null = null;
  for (const cat of ctx.categories) {
    if (cat.type !== tx.type) continue;
    const hintText = [cat.name, cat.importance_comment].filter(Boolean).join(" ");
    const hintTokens = new Set(
      normalize(hintText).split(" ").filter((tk) => tk.length >= 3)
    );
    if (hintTokens.size === 0) continue;
    const matched: string[] = [];
    for (const tk of txTokens) if (hintTokens.has(tk)) matched.push(tk);
    if (matched.length === 0) continue;
    if (!bestCat || matched.length > bestCat.score) bestCat = { cat, score: matched.length, matched };
  }
  if (bestCat) {
    return {
      transaction_id: tx.id,
      category_id: bestCat.cat.id,
      category_name: bestCat.cat.name,
      importance: bestCat.cat.importance_level,
      confidence: Math.min(0.65, 0.35 + bestCat.score * 0.1),
      reason: `Palavras-chave da categoria "${bestCat.cat.name}" (${bestCat.matched.join(", ")}) casam com a descrição.`,
      source: "category",
    };
  }

  // 5) Fallback
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