export type DashboardAccount = {
  id: string;
  name: string;
  institution?: string | null;
};

export type DashboardCreditCard = {
  id: string;
  name: string;
  institution?: string | null;
};

export type DashboardAccountGroup = {
  account: DashboardAccount;
  cards: DashboardCreditCard[];
  cardIds: Set<string>;
};

type DashboardTransactionSource = {
  account_id?: string | null;
  linked_account_id?: string | null;
  credit_card_id?: string | null;
  linked_credit_card_id?: string | null;
};

const GENERIC_TOKENS = new Set([
  "account",
  "bank",
  "banco",
  "card",
  "cartao",
  "conta",
  "credito",
  "credit",
  "corrente",
  "debito",
  "digital",
  "finance",
  "mastercard",
  "visa",
]);

const BANK_ALIASES: Record<string, string> = {
  nubank: "nubank",
  nunbank: "nubank",
  nu: "nubank",
  itau: "itau",
  santander: "santander",
  c6: "c6",
  wise: "wise",
  inter: "inter",
  bradesco: "bradesco",
  caixa: "caixa",
  sicredi: "sicredi",
  sicoob: "sicoob",
};

function tokens(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function institutionKey(item: { name: string; institution?: string | null }) {
  const source = [...tokens(item.institution), ...tokens(item.name)];
  for (const token of source) {
    if (BANK_ALIASES[token]) return BANK_ALIASES[token];
  }
  return tokens(item.institution).join(" ") || null;
}

function ownerTokens(item: { name: string; institution?: string | null }) {
  const institutionTokens = new Set(tokens(item.institution));
  return new Set(
    tokens(item.name).filter(
      (token) =>
        !GENERIC_TOKENS.has(token) && !BANK_ALIASES[token] && !institutionTokens.has(token),
    ),
  );
}

function sharedTokenCount(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

/**
 * Associates a card with the account for the same institution and holder.
 * Existing records do not have an explicit owner field, so holder names in the
 * record names (for example, "Gigi") take precedence. A generic bank account is
 * the fallback for cards whose holder is not repeated in an account name.
 */
export function buildDashboardAccountGroups(
  accounts: DashboardAccount[],
  cards: DashboardCreditCard[],
): DashboardAccountGroup[] {
  const groups = accounts.map((account) => ({
    account,
    cards: [] as DashboardCreditCard[],
    cardIds: new Set<string>(),
  }));

  for (const card of cards) {
    const cardInstitution = institutionKey(card);
    const sameInstitution = groups.filter(
      (group) => cardInstitution && institutionKey(group.account) === cardInstitution,
    );
    const candidates = sameInstitution.length > 0 ? sameInstitution : groups;
    const cardOwners = ownerTokens(card);

    const ranked = candidates
      .map((group) => ({
        group,
        accountOwners: ownerTokens(group.account),
        sharedOwners: sharedTokenCount(cardOwners, ownerTokens(group.account)),
      }))
      .sort(
        (left, right) =>
          right.sharedOwners - left.sharedOwners ||
          left.group.account.name.localeCompare(right.group.account.name, "pt-BR"),
      );

    const explicitMatch = ranked.find((candidate) => candidate.sharedOwners > 0);
    const genericMatch = ranked.find((candidate) => candidate.accountOwners.size === 0);
    const match =
      explicitMatch?.group ?? genericMatch?.group ?? (ranked.length === 1 ? ranked[0].group : null);

    if (match) {
      match.cards.push(card);
      match.cardIds.add(card.id);
    }
  }

  return groups;
}

export function matchesDashboardAccountGroup(
  transaction: DashboardTransactionSource,
  group: DashboardAccountGroup,
) {
  return (
    transaction.account_id === group.account.id ||
    transaction.linked_account_id === group.account.id ||
    Boolean(transaction.credit_card_id && group.cardIds.has(transaction.credit_card_id)) ||
    Boolean(
      transaction.linked_credit_card_id && group.cardIds.has(transaction.linked_credit_card_id),
    )
  );
}
