export type AccountBalanceTransaction = {
  account_id?: string | null;
  exclude_from_account_reconciliation?: boolean | null;
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

/**
 * A transaction can be removed from the account reconciliation without being
 * ignored elsewhere in the financial product. This dedicated flag keeps the
 * managerial reports and transaction history unchanged.
 */
export function affectsAccountReconciliation(transaction: AccountBalanceTransaction) {
  return (
    affectsAccountBalance(transaction) && transaction.exclude_from_account_reconciliation !== true
  );
}
