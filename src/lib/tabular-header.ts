const HEADER_GROUPS = [
  ["data", "date", "data do lancamento", "data da compra", "data da transacao"],
  ["lancamento", "descricao", "description", "historico", "memo", "title", "estabelecimento"],
  ["valor", "amount", "value", "montante", "valor da transacao"],
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesAlias(value: string, alias: string): boolean {
  return value === alias || value.startsWith(`${alias} `) || value.endsWith(` ${alias}`);
}

export function findTransactionHeaderColumns(record: unknown[]): number[] {
  const cells = record.map(normalizeHeader);
  return HEADER_GROUPS.map((aliases) =>
    cells.findIndex((cell) => aliases.some((alias) => matchesAlias(cell, alias))),
  ).filter((index) => index >= 0);
}

/**
 * Find the most likely transaction header in bank exports that include
 * account, statement or invoice metadata before the transaction table.
 * Falls back to the first non-empty row for ordinary spreadsheets.
 */
export function findTransactionHeaderRow(records: unknown[][]): number {
  let firstNonEmpty = -1;
  let bestIndex = -1;
  let bestScore = -1;

  records.slice(0, 100).forEach((record, index) => {
    const cells = record.map(normalizeHeader).filter(Boolean);
    if (cells.length === 0) return;
    if (firstNonEmpty === -1) firstNonEmpty = index;

    const matchedGroups = findTransactionHeaderColumns(record).length;

    // A transaction table must identify at least two of date, description
    // and amount. Prefer rows matching all three, then the more complete row.
    if (matchedGroups < 2) return;
    const score = matchedGroups * 100 + Math.min(cells.length, 20);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex >= 0 ? bestIndex : firstNonEmpty;
}
