export type WorkspaceType = "personal" | "business";

export type LabelKey =
  | "income"
  | "incomeSingular"
  | "expense"
  | "expenseSingular"
  | "balance"
  | "transactions";

export type LabelMap = Record<LabelKey, string>;

export const labels: Record<WorkspaceType, LabelMap> = {
  personal: {
    income: "Entradas",
    incomeSingular: "Entrada",
    expense: "Gastos",
    expenseSingular: "Gasto",
    balance: "Saldo",
    transactions: "Transações",
  },
  business: {
    income: "Receitas",
    incomeSingular: "Receita",
    expense: "Despesas",
    expenseSingular: "Despesa",
    balance: "Lucro",
    transactions: "Transações",
  },
};

export function L(type: WorkspaceType, overrides?: Partial<LabelMap>): LabelMap {
  return { ...labels[type], ...(overrides ?? {}) };
}
