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
  accounts?: { type?: string | null; name?: string | null } | null;
};

export type ReconciliationCard = {
  id: string;
  name: string;
  closing_day: number;
  due_day?: number;
};

export type InstallmentForecastTransaction = {
  id: string;
  date: string;
  type: "income" | "expense";
  amount: number | string;
  credit_card_id?: string | null;
  invoice_month?: string | null;
  installment?: string | null;
  status?: string | null;
};

export type InstallmentForecastCard = {
  id: string;
  name: string;
  due_day?: number | null;
};

export type CardPaymentHistoryTransaction = {
  date: string;
  linked_credit_card_id?: string | null;
  financial_role?: string | null;
  status?: string | null;
};

export type FutureInstallmentExpense = {
  month: string;
  date: string;
  cardId: string;
  cardName: string;
  amount: number;
  installmentsCount: number;
  paymentDay: number;
  paymentDaySource: "history" | "due_day";
};

export function parseInstallment(value: string | null | undefined) {
  const match = String(value ?? "").match(/(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (
    !Number.isInteger(current) ||
    !Number.isInteger(total) ||
    current < 1 ||
    total < current ||
    total > 120
  ) {
    return null;
  }
  return { current, total };
}

function addMonthsToMonth(monthValue: string, months: number) {
  const match = monthValue.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const sourceYear = Number(match[1]);
  const sourceMonth = Number(match[2]);
  const target = new Date(Date.UTC(sourceYear, sourceMonth - 1 + months, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateForPaymentDay(month: string, day: number) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const safeDay = Math.min(lastDay, Math.max(1, Math.round(day) || 1));
  return `${month}-${String(safeDay).padStart(2, "0")}`;
}

function ignoredStatus(status: string | null | undefined) {
  return ["ignored", "cancelled", "ignorado", "cancelado"].includes(
    String(status ?? "").toLowerCase(),
  );
}

export function typicalCardPaymentDay(
  cardId: string,
  payments: CardPaymentHistoryTransaction[],
  dueDay: number | null | undefined,
) {
  const days = payments
    .filter(
      (payment) =>
        payment.financial_role === "credit_card_payment" &&
        payment.linked_credit_card_id === cardId &&
        !ignoredStatus(payment.status),
    )
    .map((payment) => Number(payment.date?.slice(8, 10)))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31)
    .sort((left, right) => left - right);

  if (days.length > 0) {
    const middle = Math.floor(days.length / 2);
    const median =
      days.length % 2 === 1 ? days[middle] : Math.round((days[middle - 1] + days[middle]) / 2);
    return { day: median, source: "history" as const };
  }

  return {
    day: Math.min(31, Math.max(1, Math.round(Number(dueDay)) || 1)),
    source: "due_day" as const,
  };
}

/**
 * Projects the remaining installments found in the latest imported invoice of
 * each card. Results are grouped by month and remain read-only suggestions.
 */
export function futureInstallmentExpenseSuggestions(
  transactions: InstallmentForecastTransaction[],
  cards: InstallmentForecastCard[] = [],
  paymentHistory: CardPaymentHistoryTransaction[] = [],
): FutureInstallmentExpense[] {
  const invoiceRows = transactions.filter(
    (transaction) =>
      transaction.type === "expense" &&
      Boolean(transaction.credit_card_id) &&
      Boolean(transaction.invoice_month) &&
      !ignoredStatus(transaction.status),
  );
  const usable = invoiceRows.filter((transaction) => {
    return (
      Boolean(parseInstallment(transaction.installment)) &&
      Math.abs(Number(transaction.amount) || 0) > 0
    );
  });

  const cardById = new Map(cards.map((card) => [card.id, card]));

  const latestInvoiceByCard = new Map<string, string>();
  for (const transaction of invoiceRows) {
    const cardId = transaction.credit_card_id!;
    const invoiceMonth = transaction.invoice_month!.slice(0, 7);
    const latest = latestInvoiceByCard.get(cardId);
    if (!latest || invoiceMonth > latest) latestInvoiceByCard.set(cardId, invoiceMonth);
  }

  const byCardAndMonth = new Map<string, FutureInstallmentExpense>();
  for (const transaction of usable) {
    const cardId = transaction.credit_card_id!;
    if (transaction.invoice_month!.slice(0, 7) !== latestInvoiceByCard.get(cardId)) continue;
    const card = cardById.get(cardId);
    const paymentDay = typicalCardPaymentDay(cardId, paymentHistory, card?.due_day);
    const installment = parseInstallment(transaction.installment)!;
    const amount = Math.abs(Number(transaction.amount) || 0);
    for (let offset = 1; offset <= installment.total - installment.current; offset += 1) {
      const month = addMonthsToMonth(transaction.invoice_month!, offset);
      if (!month) continue;
      const date = dateForPaymentDay(month, paymentDay.day);
      if (!date) continue;
      const key = `${cardId}:${month}`;
      const current = byCardAndMonth.get(key) ?? {
        cardId,
        cardName: card?.name?.trim() || "Cartão",
        date,
        month,
        amount: 0,
        installmentsCount: 0,
        paymentDay: paymentDay.day,
        paymentDaySource: paymentDay.source,
      };
      current.amount += amount;
      current.installmentsCount += 1;
      byCardAndMonth.set(key, current);
    }
  }

  return [...byCardAndMonth.values()]
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.cardName.localeCompare(right.cardName),
    )
    .map((suggestion) => ({
      ...suggestion,
      amount: Math.round(suggestion.amount * 100) / 100,
    }));
}

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

export function invoiceMonthForPaymentDate(paymentDate: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ? `${paymentDate.slice(0, 7)}-01` : null;
}

function formatReferenceDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}

export function installmentReferenceDate(purchaseDate: string, paymentDate: string) {
  const purchaseMatch = purchaseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const paymentMatch = paymentDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!purchaseMatch || !paymentMatch) return null;

  const year = Number(paymentMatch[1]);
  const month = Number(paymentMatch[2]);
  const purchaseDay = Number(purchaseMatch[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${paymentMatch[1]}-${paymentMatch[2]}-${String(Math.min(purchaseDay, lastDay)).padStart(2, "0")}`;
}

export function buildCardImportDescription(input: {
  description: string;
  purchaseDate: string | null;
  paymentDate: string;
  installment?: string | null;
}) {
  const references: string[] = [];
  if (input.purchaseDate) {
    references.push(`Compra original: ${formatReferenceDate(input.purchaseDate)}`);
  }

  const installment = String(input.installment ?? "").trim();
  const installmentMatch = installment.match(/(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i);
  if (input.purchaseDate && installmentMatch && Number(installmentMatch[2]) > 1) {
    const referenceDate = installmentReferenceDate(input.purchaseDate, input.paymentDate);
    if (referenceDate) {
      references.push(
        `Parcela ${installmentMatch[1]}/${installmentMatch[2]}: ${formatReferenceDate(referenceDate)}`,
      );
    }
  }

  if (references.length === 0) return input.description.trim().slice(0, 200);
  const suffix = references.join(" · ");
  const maxDescriptionLength = Math.max(0, 200 - suffix.length - 3);
  const description = input.description.trim().slice(0, maxDescriptionLength);
  return description ? `${description} · ${suffix}` : suffix.slice(0, 200);
}

export function billingMonthForPurchase(dateValue: string, closingDay: number, dueDay?: number) {
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  const safeClosingDay = Math.min(31, Math.max(1, Number(closingDay) || 1));
  const safeDueDay = Math.min(31, Math.max(1, Number(dueDay) || safeClosingDay));
  const closingMonthOffset = day >= safeClosingDay ? 1 : 0;
  const paymentMonthOffset = safeDueDay <= safeClosingDay ? 1 : 0;
  const paymentDate = new Date(year, month - 1 + closingMonthOffset + paymentMonthOffset, 1, 12);
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

export function isCheckingAccountCashFlowTransaction(transaction: ReconciliationTransaction) {
  return (
    Boolean(transaction.account_id) &&
    transaction.accounts?.type === "checking" &&
    isCashFlowTransaction(transaction)
  );
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
