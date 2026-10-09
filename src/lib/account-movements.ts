export const ACCOUNT_MOVEMENT_ROLES = [
  "internal_transfer",
  "investment_contribution",
  "investment_redemption",
] as const;

export type AccountMovementRole = (typeof ACCOUNT_MOVEMENT_ROLES)[number];

export type AccountMovementTransaction = {
  id?: string;
  type?: "income" | "expense" | string | null;
  amount?: number | string | null;
  financial_role?: string | null;
  transfer_group_id?: string | null;
};

export function isAccountMovement(
  transaction: Pick<AccountMovementTransaction, "financial_role">,
): boolean {
  return ACCOUNT_MOVEMENT_ROLES.includes(transaction.financial_role as AccountMovementRole);
}

export function accountMovementLabel(role: string | null | undefined) {
  if (role === "internal_transfer") return "Transferência interna";
  if (role === "investment_contribution") return "Aporte em investimento";
  if (role === "investment_redemption") return "Resgate de investimento";
  return "Movimentação patrimonial";
}

export type AccountMovementSummary = {
  transfers: { count: number; amount: number };
  contributions: { count: number; amount: number };
  redemptions: { count: number; amount: number };
};

export type MovementConversionDefaults = {
  investmentAction: "contribution" | "redemption";
  sourceAccountId: string;
  destinationAccountId: string;
};

/**
 * Keeps the already-registered transaction on the same account side while the
 * user chooses the counter-account that completes the movement.
 */
export function movementConversionDefaults(
  transaction: { type?: string | null; account_id?: string | null },
  currentAccountType?: string | null,
): MovementConversionDefaults {
  const currentAccountId = transaction.account_id ?? "";
  const isIncome = transaction.type === "income";
  const investmentAction =
    currentAccountType === "investment"
      ? isIncome
        ? "contribution"
        : "redemption"
      : isIncome
        ? "redemption"
        : "contribution";

  return {
    investmentAction,
    sourceAccountId: isIncome ? "" : currentAccountId,
    destinationAccountId: isIncome ? currentAccountId : "",
  };
}

/**
 * Summarizes paired movements once per transfer group. The outgoing side is
 * used for transfers/contributions and the incoming side for redemptions.
 */
export function summarizeAccountMovements(
  transactions: AccountMovementTransaction[],
): AccountMovementSummary {
  const summary: AccountMovementSummary = {
    transfers: { count: 0, amount: 0 },
    contributions: { count: 0, amount: 0 },
    redemptions: { count: 0, amount: 0 },
  };
  const seen = new Set<string>();

  for (const transaction of transactions) {
    if (!isAccountMovement(transaction)) continue;
    const role = transaction.financial_role as AccountMovementRole;
    const isRepresentative =
      (role === "investment_redemption" && transaction.type === "income") ||
      (role !== "investment_redemption" && transaction.type === "expense");
    if (!isRepresentative) continue;

    const key = transaction.transfer_group_id || transaction.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const amount = Math.abs(Number(transaction.amount) || 0);
    const bucket =
      role === "internal_transfer"
        ? summary.transfers
        : role === "investment_contribution"
          ? summary.contributions
          : summary.redemptions;
    bucket.count += 1;
    bucket.amount += amount;
  }

  return summary;
}
