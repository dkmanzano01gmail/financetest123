export type WorkspaceType = "personal" | "business";

export const labels = {
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
} as const;

export function L(type: WorkspaceType) {
  return labels[type];
}
