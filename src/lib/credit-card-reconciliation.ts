export type ReconciliationTransaction = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number | string;
  description?: string | null;
  account_id?: string | null;
  credit_card_id?: string | null;
  linked_credit_card_id?: string | null;
  invoice_month?: string | null;
  financial_role?: string | null;
  reversal_of_transaction_id?: string | null;
  status?: string | null;
  categories?: { name?: string | null } | null;
};

export type ReconciliationCard = {
  id: string;
  name: string;
  closing_day: number;
  due_day?: number;
};

export function normalizeReconciliationText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function invoiceMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function billingMonthForPurchase(
  dateValue: string,
  closingDay: number,
  dueDay?: number,
) {
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  const safeClosingDay = Math.min(31, Math.max(1, Number(closingDay) || 1));
  const safeDueDay = Math.min(31, Math.max(1, Number(dueDay) || safeClosingDay));
  const closingMonthOffset = day >= safeClosingDay ? 1 : 0;
  const paymentMonthOffset = safeDueDay <= safeClosingDay ? 1 : 0;
  const paymentDate = new Date(
    year,
    month - 1 + closingMonthOffset + paymentMonthOffset,
    1,
    12,
  );
  return invoiceMonthKey(paymentDate.getFullYear(), paymentDate.getMonth() + 1);
}

export function financialDateForTransaction(transaction: ReconciliationTransaction) {
  return transaction.credit_card_id && transaction.invoice_month
    ? transaction.invoice_month.slice(0, 10)
    : transaction.date;
}

export function financialMonthKey(transaction: ReconciliationTransaction) {
  return financialDateForTransaction(transaction).slice(0, 7);
}

export function isCreditCardPayment(transaction: ReconciliationTransaction) {
  return transaction.financial_role === "credit_card_payment";
}

export function isCreditCardPaymentOffset(transaction: ReconciliationTransaction) {
  return transaction.financial_role === "credit_card_payment_offset";
}

export function isConsumptionTransaction(transaction: ReconciliationTransaction) {
  return !isCreditCardPayment(transaction) && !isCreditCardPaymentOffset(transaction);
}

export function isCashFlowTransaction(transaction: ReconciliationTransaction) {
  return !transaction.credit_card_id && !isCreditCardPaymentOffset(transaction);
}

export function analyticalTransactionType(transaction: ReconciliationTransaction) {
  return isCreditCardPaymentOffset(transaction) ? "expense" : transaction.type;
}

/**
 * Nets each generated offset against its original payment for analytical views.
 * The raw transaction list remains untouched and auditable. Partial offsets leave
 * only the unallocated remainder of the original expense.
 */
export function netCardPaymentOffsets<T extends ReconciliationTransaction>(transactions: T[]): T[] {
  const offsetByOriginal = new Map<string, number>();
  for (const transaction of transactions) {
    if (!isCreditCardPaymentOffset(transaction) || !transaction.reversal_of_transaction_id)
      continue;
    offsetByOriginal.set(
      transaction.reversal_of_transaction_id,
      (offsetByOriginal.get(transaction.reversal_of_transaction_id) || 0) +
        Math.abs(Number(transaction.amount) || 0),
    );
  }

  return transactions.flatMap((transaction) => {
    if (isCreditCardPaymentOffset(transaction)) return [];
    const offset = offsetByOriginal.get(transaction.id) || 0;
    if (!offset) return [transaction];
    const remaining = Math.max(Math.abs(Number(transaction.amount) || 0) - offset, 0);
    return remaining > 0.005 ? [{ ...transaction, amount: remaining }] : [];
  });
}

export function isLikelyInvoicePayment(transaction: ReconciliationTransaction) {
  if (
    transaction.type !== "expense" ||
    !transaction.account_id ||
    transaction.credit_card_id ||
    isCreditCardPayment(transaction) ||
    isCreditCardPaymentOffset(transaction) ||
    ["ignored", "cancelled", "ignorado"].includes(String(transaction.status ?? "").toLowerCase())
  )
    return false;

  const description = normalizeReconciliationText(transaction.description);
  const category = normalizeReconciliationText(transaction.categories?.name);
  return (
    description.includes("pagamento de fatura") ||
    description.includes("nu pagamentos") ||
    category.includes("cartao de credito")
  );
}

export function isPossibleDuplicatePayment(
  candidate: ReconciliationTransaction,
  candidates: ReconciliationTransaction[],
) {
  const amount = Math.abs(Number(candidate.amount) || 0);
  const date = new Date(`${candidate.date.slice(0, 10)}T12:00:00`).getTime();
  return candidates.some((other) => {
    if (other.id === candidate.id) return false;
    const otherAmount = Math.abs(Number(other.amount) || 0);
    const otherDate = new Date(`${other.date.slice(0, 10)}T12:00:00`).getTime();
    const days = Math.abs(otherDate - date) / 86_400_000;
    return Math.abs(otherAmount - amount) <= 0.01 && days <= 2;
  });
}

export function suggestedCardId(
  candidate: ReconciliationTransaction,
  cards: ReconciliationCard[],
  invoiceTotals: Map<string, number>,
) {
  const category = normalizeReconciliationText(candidate.categories?.name);
  const amount = Math.abs(Number(candidate.amount) || 0);
  const named = cards.filter((card) => {
    const cardName = normalizeReconciliationText(card.name);
    if (category.includes("pessoal")) return cardName.includes("pessoal");
    if (category.includes("sela") || category.includes("orna")) {
      return cardName.includes("sela") || cardName.includes("orna");
    }
    return false;
  });
  if (named.length === 1) return named[0].id;

  const exact = cards.filter(
    (card) => Math.abs((invoiceTotals.get(card.id) || 0) - amount) <= 0.01,
  );
  if (exact.length === 1) return exact[0].id;
  return cards.length === 1 ? cards[0].id : null;
}
