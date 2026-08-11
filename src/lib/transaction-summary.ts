import type { MoneyFlowType, OrnaTransaction } from "@/lib/orna-logic";

export type TransactionCategorySummary = {
  key: string;
  name: string;
  color: string;
  type: MoneyFlowType;
  count: number;
  value: number;
};

export type TransactionSourceFilter = "all" | "account" | "credit_card";

type TransactionSourceReference = {
  account_id?: string | null;
  credit_card_id?: string | null;
};

export function matchesTransactionSource(
  transaction: TransactionSourceReference,
  source: TransactionSourceFilter,
): boolean {
  if (source === "account") return Boolean(transaction.account_id);
  if (source === "credit_card") return Boolean(transaction.credit_card_id);
  return true;
}

export function transactionCategoryKey(transaction: OrnaTransaction): string {
  const name = transaction.categories?.name || "Sem categoria";
  return `${transaction.type}:${transaction.category_id || name}`;
}

export function summarizeTransactionsByCategory(
  transactions: OrnaTransaction[],
): TransactionCategorySummary[] {
  const summaries = new Map<string, TransactionCategorySummary>();

  for (const transaction of transactions) {
    const name = transaction.categories?.name || "Sem categoria";
    const key = transactionCategoryKey(transaction);
    const current = summaries.get(key);
    const amount = Math.abs(Number(transaction.amount) || 0);

    if (current) {
      current.count += 1;
      current.value += amount;
      continue;
    }

    summaries.set(key, {
      key,
      name,
      color:
        transaction.categories?.color || (transaction.type === "income" ? "#6E7A57" : "#A03A2A"),
      type: transaction.type,
      count: 1,
      value: amount,
    });
  }

  return [...summaries.values()].sort((a, b) => b.value - a.value);
}
