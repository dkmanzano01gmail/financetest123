/**
 * Pure, side-effect-free billing / unit-economics logic.
 * Shared by the client screens and by the test runner.
 */

export type PlanCode = "personal" | "atelier";

export const PLANS: Record<PlanCode, { code: PlanCode; name: string; monthly_price: number; included_credits: number }> = {
  personal: { code: "personal", name: "Selá Pessoal", monthly_price: 49.9, included_credits: 2 },
  atelier: { code: "atelier", name: "Selá Atelier", monthly_price: 79.9, included_credits: 4 },
};

export const CREDIT_PACKS = [
  { code: "pack_5", name: "5 créditos", credits: 5, price: 49 },
  { code: "pack_15", name: "15 créditos", credits: 15, price: 129 },
  { code: "pack_30", name: "30 créditos", credits: 30, price: 229 },
] as const;

/** Managerial reference value of one credit (BRL). */
export const CREDIT_REFERENCE_VALUE = 10;

/** Above this estimate a customization needs scope analysis instead of self-approval. */
export const ADVANCED_CREDIT_THRESHOLD = 5;

export type LedgerType =
  | "monthly_grant"
  | "purchase"
  | "reservation"
  | "release"
  | "consumption"
  | "refund"
  | "adjustment"
  | "expiration";

export type LedgerEntry = { type: LedgerType; credits_delta: number };

export type WalletBalance = {
  available: number;
  reserved: number;
  granted: number;
  purchased: number;
  consumed: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors the SQL view public.credit_wallets — balance is always derived from the ledger. */
export function walletFromLedger(entries: LedgerEntry[]): WalletBalance {
  let available = 0, reserved = 0, granted = 0, purchased = 0, consumed = 0;
  for (const e of entries) {
    const d = Number(e.credits_delta) || 0;
    if (e.type !== "consumption") available += d;
    if (e.type === "reservation" || e.type === "release") reserved -= d;
    if (e.type === "consumption") reserved += d;
    if (e.type === "monthly_grant") granted += d;
    if (e.type === "purchase") purchased += d;
    if (e.type === "consumption") consumed -= d;
  }
  return {
    available: round2(available),
    reserved: round2(reserved),
    granted: round2(granted),
    purchased: round2(purchased),
    consumed: round2(consumed),
  };
}

export type ReservationRequest = {
  estimated_credits?: number | null;
  approved_credits?: number | null;
  is_bug_fix?: boolean | null;
  reserved_credits?: number | null;
  consumed_credits?: number | null;
  pricing_status?: string | null;
};

export function creditsNeededFor(req: ReservationRequest): number {
  if (req.is_bug_fix) return 0;
  return Math.max(Number(req.approved_credits ?? req.estimated_credits ?? 0) || 0, 0);
}

/** Mirrors reserve_customization_credits: never lets available go negative. */
export function canReserve(req: ReservationRequest, available: number) {
  const needed = creditsNeededFor(req);
  if (needed === 0) return { ok: true as const, needed: 0, balanceAfter: round2(available) };
  if (available < needed) {
    return { ok: false as const, needed, balanceAfter: round2(available), reason: "insufficient_credits" };
  }
  return { ok: true as const, needed, balanceAfter: round2(available - needed) };
}

/** > 5 credits without an admin-set budget requires scope analysis. */
export function requiresScopeAnalysis(req: ReservationRequest) {
  if (req.is_bug_fix) return false;
  const estimate = Number(req.approved_credits ?? req.estimated_credits ?? 0) || 0;
  if (estimate <= ADVANCED_CREDIT_THRESHOLD) return false;
  return req.pricing_status !== "approved" && req.pricing_status !== "quoted";
}

export type PaymentRow = {
  type: "subscription" | "credit_pack" | "refund" | "adjustment";
  status: "pending" | "paid" | "failed" | "refunded";
  gross_amount: number;
  payment_fee?: number | null;
};

/**
 * Revenue comes ONLY from paid payments. Credits spent are never counted as
 * revenue — their nominal value is a separate managerial metric.
 */
export function revenueFromPayments(payments: PaymentRow[]) {
  let subscription = 0, creditPack = 0, refunds = 0, fees = 0;
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const gross = Number(p.gross_amount) || 0;
    if (p.type === "subscription") subscription += gross;
    else if (p.type === "credit_pack") creditPack += gross;
    else if (p.type === "refund") refunds += gross;
    fees += Number(p.payment_fee) || 0;
  }
  return {
    subscription_revenue: round2(subscription),
    credit_pack_revenue: round2(creditPack),
    refunds: round2(refunds),
    total_revenue: round2(subscription + creditPack - refunds),
    payment_fees: round2(fees),
  };
}

export function contributionMargin(input: {
  total_revenue: number;
  payment_fees: number;
  direct_variable_costs: number;
}) {
  const cm = round2(input.total_revenue - input.payment_fees - input.direct_variable_costs);
  return {
    contribution_margin: cm,
    contribution_margin_pct: input.total_revenue > 0 ? round2((100 * cm) / input.total_revenue) : 0,
  };
}

export function operatingResult(input: {
  total_revenue: number;
  payment_fees: number;
  variable_costs: number;
  fixed_operating_costs: number;
  credits_consumed?: number;
  credit_reference_value?: number;
  customization_variable_costs?: number;
}) {
  const { contribution_margin, contribution_margin_pct } = contributionMargin({
    total_revenue: input.total_revenue,
    payment_fees: input.payment_fees,
    direct_variable_costs: input.variable_costs,
  });
  const operating_profit = round2(contribution_margin - input.fixed_operating_costs);
  const consumed = input.credits_consumed ?? 0;
  const ref = input.credit_reference_value ?? CREDIT_REFERENCE_VALUE;
  const economic_value = round2(consumed * ref);
  const custCosts = input.customization_variable_costs ?? 0;
  return {
    contribution_margin,
    contribution_margin_pct,
    operating_profit,
    operating_margin_pct: input.total_revenue > 0 ? round2((100 * operating_profit) / input.total_revenue) : 0,
    economic_value_of_credits_consumed: economic_value,
    avg_cost_per_consumed_credit: consumed > 0 ? round2(custCosts / consumed) : 0,
    personalization_economic_margin: round2(economic_value - custCosts),
  };
}

export const OPERATING_COST_CATEGORIES = [
  { value: "lovable_fixed", label: "Lovable (fixo)" },
  { value: "supabase", label: "Backend / Supabase" },
  { value: "domain", label: "Domínio" },
  { value: "email", label: "E-mail" },
  { value: "accounting", label: "Contabilidade" },
  { value: "software", label: "Software" },
  { value: "payroll", label: "Pessoas" },
  { value: "marketing", label: "Marketing" },
  { value: "other", label: "Outros" },
] as const;

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  suspended: "Suspensa",
};

export const LEDGER_TYPE_LABEL: Record<string, string> = {
  monthly_grant: "Créditos do plano",
  purchase: "Compra de pacote",
  reservation: "Reserva",
  release: "Liberação de reserva",
  consumption: "Consumo",
  refund: "Estorno",
  adjustment: "Ajuste",
  expiration: "Expiração",
};

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  subscription: "Assinatura",
  credit_pack: "Pacote de créditos",
  refund: "Reembolso",
  adjustment: "Ajuste",
};
