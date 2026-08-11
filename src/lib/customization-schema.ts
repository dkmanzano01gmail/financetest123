/**
 * Shared, side-effect-free contract for the customization engine.
 * Used by the server functions (validation + security matrix) and by the
 * client hooks (scope-aware merge + precedence). Pure so it is testable.
 */
import { z } from "zod";

/** Canonical menu keys — must stay in sync with app-shell nav definitions. */
export const NAV_KEYS = [
  "nav.dashboard",
  "nav.transactions",
  "nav.accounts",
  "nav.cards",
  "nav.budget",
  "nav.reconciliation",
  "nav.categories",
  "nav.import",
  "nav.atelier.cash_flow",
  "nav.atelier.raw_materials",
  "nav.atelier.class_materials",
  "nav.atelier.attendance",
  "nav.atelier.students",
  "nav.atelier.kilns",
  "nav.atelier.renovation",
  "nav.atelier.pieces",
  "nav.atelier.workshops",
  "nav.atelier.firings",
  "nav.feedback",
  "nav.customizations",
  "nav.settings",
  "nav.admin",
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export const CARD_KEYS = [
  "income",
  "expense",
  "balance",
  "accounts_balance",
  "top_category",
  "recent_transactions",
  "budget_overview",
  "reconciliation_status",
] as const;
export type CardKey = (typeof CARD_KEYS)[number];

export type TargetScope = "user" | "workspace";

/** Operations the runtime can apply by itself (presentation only). */
export const AUTO_APPLY_TYPES = [
  "label_rename",
  "nav_visibility",
  "nav_reorder",
  "card_visibility",
  "dashboard_widget_order",
  "saved_filter",
] as const;
export type AutoApplyType = (typeof AUTO_APPLY_TYPES)[number];

/**
 * Operations that touch shared/financial data or the product itself.
 * They are NEVER applied automatically, in any scope.
 */
export const NEVER_AUTO_TYPES = [
  "new_category",
  "category_rule",
  "calculation",
  "schema_change",
  "integration",
  "code_change",
  "other",
];

const navKey = z.enum(NAV_KEYS);
const cardKey = z.enum(CARD_KEYS);
const label = z.string().trim().min(1).max(60);

const uniqueArray = <T extends string>(schema: z.ZodType<T>) =>
  z
    .array(schema)
    .min(2)
    .max(40)
    .refine((arr) => new Set(arr).size === arr.length, { message: "ordem com chaves duplicadas" });

export const LabelRenameConfig = z
  .object({
    labels: z.record(navKey, label).refine((m) => Object.keys(m).length > 0, {
      message: "nenhum label informado",
    }),
  })
  .strict();

export const NavVisibilityConfig = z.object({ menu_key: navKey, visible: z.boolean() }).strict();

export const NavReorderConfig = z.object({ order: uniqueArray(navKey) }).strict();

export const CardVisibilityConfig = z.object({ card_id: cardKey, visible: z.boolean() }).strict();

export const DashboardWidgetOrderConfig = z.object({ order: uniqueArray(cardKey) }).strict();

export const SavedFilterConfig = z
  .object({
    name: z.string().trim().min(1).max(60),
    filters: z
      .object({
        search: z.string().max(120).optional(),
        type: z.enum(["income", "expense", "all"]).optional(),
        year: z.number().int().min(1970).max(2999).optional(),
        month: z.number().int().min(1).max(12).optional(),
      })
      .strict(),
  })
  .strict();

export const AutoOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("label_rename"), configuration_json: LabelRenameConfig }),
  z.object({ type: z.literal("nav_visibility"), configuration_json: NavVisibilityConfig }),
  z.object({ type: z.literal("nav_reorder"), configuration_json: NavReorderConfig }),
  z.object({ type: z.literal("card_visibility"), configuration_json: CardVisibilityConfig }),
  z.object({
    type: z.literal("dashboard_widget_order"),
    configuration_json: DashboardWidgetOrderConfig,
  }),
  z.object({ type: z.literal("saved_filter"), configuration_json: SavedFilterConfig }),
]);

export type ValidationResult =
  | { ok: true; type: AutoApplyType; configuration_json: Record<string, unknown> }
  | { ok: false; reason: string };

export const CALCULATION_REVIEW_MESSAGE =
  "Recebido para análise; cálculos financeiros exigem validação antes de serem ativados.";

/**
 * Validates an interpretation (local or AI produced). Anything that is not an
 * exact match for a whitelisted, presentation-only operation is rejected so the
 * caller can route it to needs_admin_review.
 */
export function validateAutoOperation(input: unknown): ValidationResult {
  const obj = input as { type?: unknown; configuration_json?: unknown } | null;
  const type = typeof obj?.type === "string" ? obj.type : "";
  if (!type) return { ok: false, reason: "Pedido sem operação identificada." };
  if (!(AUTO_APPLY_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      reason:
        type === "new_category" || type === "category_rule"
          ? "Alteração de dados compartilhados (categorias/regras) exige revisão."
          : "Operação fora da lista permitida para aplicação automática.",
    };
  }
  const parsed = AutoOperationSchema.safeParse({
    type,
    configuration_json: obj?.configuration_json ?? {},
  });
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Configuração inválida: ${parsed.error.issues[0]?.message ?? "erro"}`,
    };
  }
  return {
    ok: true,
    type: parsed.data.type,
    configuration_json: parsed.data.configuration_json as Record<string, unknown>,
  };
}

/** True when the requester may auto-apply in the requested scope. */
export function canAutoApply(scope: TargetScope, role: string | null | undefined): boolean {
  if (scope === "user") return true;
  return role === "owner";
}

export type ScopedRow = {
  id?: string;
  type: string;
  configuration_json: any;
  is_active?: boolean;
  is_testing?: boolean;
  updated_at?: string | null;
  target_scope?: string | null;
  target_user_id?: string | null;
};

/**
 * Filters rows visible to `userId` and sorts them by precedence:
 * user scope > workspace scope, testing > definitive, most recent first.
 * The first row wins for a given target key.
 */
export function sortByPrecedence<T extends ScopedRow>(rows: T[], userId?: string | null): T[] {
  const visible = rows.filter((r) => {
    if (r.is_active === false) return false;
    const scope = r.target_scope ?? "workspace";
    if (scope === "user") return !!userId && r.target_user_id === userId;
    return true;
  });
  return [...visible].sort((a, b) => {
    const scopeRank = (r: ScopedRow) => ((r.target_scope ?? "workspace") === "user" ? 0 : 1);
    if (scopeRank(a) !== scopeRank(b)) return scopeRank(a) - scopeRank(b);
    const testRank = (r: ScopedRow) => (r.is_testing ? 0 : 1);
    if (testRank(a) !== testRank(b)) return testRank(a) - testRank(b);
    return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
  });
}

/** Merges label_rename rows honouring precedence (first seen key wins). */
export function mergeLabelOverrides<T extends ScopedRow>(
  rows: T[],
  userId?: string | null,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const row of sortByPrecedence(rows, userId)) {
    if (row.type !== "label_rename") continue;
    const labels = row.configuration_json?.labels;
    if (!labels || typeof labels !== "object") continue;
    for (const [k, v] of Object.entries(labels)) {
      if (typeof v === "string" && v.trim() && !(k in merged)) merged[k] = v;
    }
  }
  return merged;
}

/** Resolves a boolean visibility operation per target key using the same precedence rules. */
export function resolveVisibility<T extends ScopedRow>(
  rows: T[],
  type: "nav_visibility" | "card_visibility",
  keyField: "menu_key" | "card_id",
  userId?: string | null,
): Map<string, boolean> {
  const resolved = new Map<string, boolean>();
  for (const row of sortByPrecedence(rows, userId)) {
    if (row.type !== type) continue;
    const config = row.configuration_json ?? {};
    const nested = type === "nav_visibility" ? config.nav_visibility : null;
    const payload = nested && typeof nested === "object" ? nested : config;
    const key = payload?.[keyField];
    if (typeof key !== "string" || resolved.has(key) || typeof payload.visible !== "boolean") {
      continue;
    }
    resolved.set(key, payload.visible);
  }
  return resolved;
}
