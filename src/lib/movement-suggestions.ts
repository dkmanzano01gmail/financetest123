export type MovementSuggestionRule = {
  movement_kind: "internal_transfer";
  match_groups: Array<{
    all: string[];
    label?: string;
  }>;
};

export type MovementSuggestion = {
  movement_kind: "internal_transfer";
  label: "Transferir";
  reason: string;
};

export type MovementSuggestionInput = {
  description?: string | null;
  counterparty?: string | null;
  account_id?: string | null;
  credit_card_id?: string | null;
  linked_credit_card_id?: string | null;
  reversal_of_transaction_id?: string | null;
  financial_role?: string | null;
};

function normalizeMovementText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMovementSuggestionRule(value: unknown): value is MovementSuggestionRule {
  const rule = value as MovementSuggestionRule | null;
  return (
    rule?.movement_kind === "internal_transfer" &&
    Array.isArray(rule.match_groups) &&
    rule.match_groups.length > 0 &&
    rule.match_groups.every(
      (group) =>
        Array.isArray(group?.all) &&
        group.all.length > 0 &&
        group.all.every((term) => typeof term === "string" && term.trim().length > 0),
    )
  );
}

export function suggestMovementForTransaction(
  transaction: MovementSuggestionInput,
  rules: MovementSuggestionRule[],
): MovementSuggestion | null {
  if (
    !transaction.account_id ||
    transaction.credit_card_id ||
    transaction.linked_credit_card_id ||
    transaction.reversal_of_transaction_id ||
    (transaction.financial_role && transaction.financial_role !== "regular")
  ) {
    return null;
  }

  const text = normalizeMovementText(
    `${transaction.description ?? ""} ${transaction.counterparty ?? ""}`,
  );
  if (!text) return null;

  for (const rule of rules) {
    for (const group of rule.match_groups) {
      const terms = group.all.map(normalizeMovementText).filter(Boolean);
      if (terms.length > 0 && terms.every((term) => text.includes(term))) {
        return {
          movement_kind: "internal_transfer",
          label: "Transferir",
          reason: group.label
            ? `Transferência de ou para ${group.label}.`
            : "Favorecido reconhecido como uma conta do próprio perfil.",
        };
      }
    }
  }
  return null;
}
