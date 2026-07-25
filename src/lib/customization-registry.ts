/**
 * Capability Registry — single source of truth for everything the
 * personalization engine can do automatically. The AI prompt is generated
 * from this so adding a new primitive here = the engine learns it.
 *
 * Anything not expressible here gets classified as "advanced" and routed
 * to the super-admin queue with the original NL request preserved.
 */

export type NavKey =
  | "nav.dashboard"
  | "nav.transactions"
  | "nav.accounts"
  | "nav.cards"
  | "nav.budget"
  | "nav.reconciliation"
  | "nav.categories"
  | "nav.import"
  | "nav.customizations"
  | "nav.settings"
  | "nav.admin";

export const NAV_KEYS: NavKey[] = [
  "nav.dashboard",
  "nav.transactions",
  "nav.accounts",
  "nav.cards",
  "nav.budget",
  "nav.reconciliation",
  "nav.categories",
  "nav.import",
  "nav.customizations",
  "nav.settings",
  "nav.admin",
];

export type CardKey =
  | "income"
  | "expense"
  | "balance"
  | "accounts_balance"
  | "top_category"
  | "recent_transactions"
  | "budget_overview"
  | "reconciliation_status";

export const CARD_KEYS: CardKey[] = [
  "income",
  "expense",
  "balance",
  "accounts_balance",
  "top_category",
  "recent_transactions",
  "budget_overview",
  "reconciliation_status",
];

/** Operation envelope persisted in customizations.operation_payload. */
export type Operation =
  | { kind: "label_rename"; menu_key: string; new_label: string }
  | { kind: "card_visibility"; card_id: CardKey | string; visible: boolean }
  | { kind: "nav_visibility"; menu_key: NavKey; visible: boolean }
  | { kind: "nav_reorder"; order: NavKey[] }
  | { kind: "dashboard_widget_order"; order: CardKey[] }
  | {
      kind: "new_category";
      name: string;
      type: "income" | "expense";
      color?: string;
      importance_level?: "essential" | "important" | "flexible" | "superfluous";
    }
  | { kind: "saved_filter"; name: string; filters: Record<string, unknown> }
  | { kind: "category_rule"; rule: CategoryRule };

/**
 * Rich rule schema covering the user's exact use cases:
 *   - "recebimentos repetidos do mesmo descritivo / pessoa todo mês"
 *   - "valor 290 ou múltiplo de 290"
 * Multiple conditions in a rule are AND-combined.
 */
export type CategoryRule = {
  category_name: string;
  transaction_type?: "income" | "expense";
  importance_level?: "essential" | "important" | "flexible" | "superfluous";
  conditions: RuleCondition[];
  /** lower = applied first. default 100. */
  priority?: number;
  notes?: string;
};

export type RuleCondition =
  | {
      kind: "descriptor";
      match_text: string;
      match_mode?: "contains" | "equals" | "starts_with" | "regex";
    }
  | { kind: "counterparty"; match_text: string; match_mode?: "contains" | "equals" | "starts_with" }
  | {
      kind: "amount";
      operator: "equals" | "multiple_of" | "between" | "greater_than" | "less_than";
      value: number;
      value2?: number;
    }
  | {
      kind: "recurrence";
      basis: "descriptor" | "counterparty";
      min_count: number;
      window_days: number;
    };

/** Human prompt fragment listing every primitive — fed into the AI system message. */
export function registryAsPromptFragment(): string {
  return [
    "PRIMITIVAS DISPONÍVEIS (qualquer pedido fora destas → advanced):",
    "",
    `1. label_rename — renomeia item de menu. menu_key ∈ {${NAV_KEYS.join(", ")}}.`,
    `2. card_visibility — mostra/esconde card. card_id ∈ {${CARD_KEYS.join(", ")}}.`,
    `3. nav_visibility — esconde/mostra aba do menu. menu_key ∈ {${NAV_KEYS.join(", ")}}.`,
    `4. nav_reorder — reordena abas do menu. order: array com NAV_KEYS na ordem desejada.`,
    `5. dashboard_widget_order — reordena cards do dashboard. order: array com CARD_KEYS.`,
    "6. new_category — cria categoria (name, type, color?, importance_level?).",
    "7. saved_filter — salva filtro nomeado (name, filters: { search?, type?, year?, month? }).",
    "8. category_rule — cria regra automática de categorização. Pode combinar várias condições (AND):",
    "   • descriptor: match_text + match_mode (contains|equals|starts_with|regex)",
    "   • counterparty: match_text + match_mode (contains|equals|starts_with)",
    "   • amount: operator (equals|multiple_of|between|greater_than|less_than) + value [+ value2 para between]",
    "   • recurrence: basis (descriptor|counterparty) + min_count + window_days",
    "",
    "Exemplos:",
    `  "valores de 290 ou múltiplos = Workshops" →`,
    `    { kind:"category_rule", rule:{ category_name:"Workshops", transaction_type:"income",`,
    `      conditions:[{ kind:"amount", operator:"multiple_of", value:290 }] } }`,
    `  "recebimentos mensais do mesmo descritivo = Aulas regulares" →`,
    `    { kind:"category_rule", rule:{ category_name:"Aulas regulares", transaction_type:"income",`,
    `      conditions:[{ kind:"recurrence", basis:"descriptor", min_count:2, window_days:90 }] } }`,
  ].join("\n");
}
