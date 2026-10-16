export type AccountBalanceTransaction = {
  account_id?: string | null;
  financial_role?: string | null;
  status?: string | null;
};

/**
 * Account reconciliation follows the ledger, not the managerial income and
 * expense view. Every active row linked to an account changes that account's
 * balance, including transfers, investments and card payments. The only
 * exception is the generated credit-card offset, which exists solely to
 * neutralize management reports and is not a bank movement.
 */
export function affectsAccountBalance(transaction: AccountBalanceTransaction) {
  return (
    Boolean(transaction.account_id) &&
    transaction.status !== "ignored" &&
    transaction.financial_role !== "credit_card_payment_offset"
  );
}
