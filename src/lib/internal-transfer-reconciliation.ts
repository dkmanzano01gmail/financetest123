export type TransferReconciliationTransaction = {
  id: string;
  date: string;
  type: "income" | "expense" | string;
  amount: number | string;
  description: string;
  account_id: string | null;
  linked_account_id?: string | null;
  financial_role?: string | null;
  transfer_group_id?: string | null;
  source?: string | null;
  method?: string | null;
  notes?: string | null;
  reconciliation_method?: string | null;
  status?: string | null;
};

export type TransferReconciliationStatus = "reconciled" | "candidate" | "missing" | "invalid";

export type InternalTransferGroup = {
  id: string;
  outgoing: TransferReconciliationTransaction | null;
  incoming: TransferReconciliationTransaction | null;
  rows: TransferReconciliationTransaction[];
  candidates: TransferReconciliationTransaction[];
  status: TransferReconciliationStatus;
  amount: number;
  date: string;
};

function dayDistance(left: string, right: string) {
  const leftTime = new Date(`${left}T12:00:00`).getTime();
  const rightTime = new Date(`${right}T12:00:00`).getTime();
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function isImported(transaction: TransferReconciliationTransaction) {
  return transaction.source !== "manual";
}

function sameAmount(
  left: TransferReconciliationTransaction,
  right: TransferReconciliationTransaction,
) {
  return Math.abs(Math.abs(Number(left.amount)) - Math.abs(Number(right.amount))) < 0.005;
}

function isValidPair(
  outgoing: TransferReconciliationTransaction | null,
  incoming: TransferReconciliationTransaction | null,
) {
  return Boolean(
    outgoing &&
    incoming &&
    outgoing.account_id &&
    incoming.account_id &&
    outgoing.account_id !== incoming.account_id &&
    outgoing.linked_account_id === incoming.account_id &&
    incoming.linked_account_id === outgoing.account_id &&
    sameAmount(outgoing, incoming),
  );
}

export function buildInternalTransferReconciliation(
  transactions: TransferReconciliationTransaction[],
): InternalTransferGroup[] {
  const movementRows = transactions.filter(
    (transaction) =>
      transaction.financial_role === "internal_transfer" && transaction.status !== "ignored",
  );
  const regularImportedRows = transactions.filter(
    (transaction) =>
      (transaction.financial_role ?? "regular") === "regular" &&
      transaction.status !== "ignored" &&
      Boolean(transaction.account_id) &&
      isImported(transaction),
  );
  const byGroup = new Map<string, TransferReconciliationTransaction[]>();

  for (const transaction of movementRows) {
    const key = transaction.transfer_group_id || `orphan:${transaction.id}`;
    const rows = byGroup.get(key) ?? [];
    rows.push(transaction);
    byGroup.set(key, rows);
  }

  const claimedCandidates = new Set<string>();
  const groups = [...byGroup.entries()]
    .map(([id, rows]) => {
      const outgoing = rows.find((row) => row.type === "expense") ?? null;
      const incoming = rows.find((row) => row.type === "income") ?? null;
      const validPair = isValidPair(outgoing, incoming) && rows.length === 2;
      const importedPair =
        validPair &&
        outgoing &&
        incoming &&
        (outgoing.reconciliation_method === "internal_transfer_import_match" ||
          incoming.reconciliation_method === "internal_transfer_import_match" ||
          (isImported(outgoing) && isImported(incoming)));
      const syntheticRows = validPair ? rows.filter((row) => !isImported(row)) : [];
      const candidates = syntheticRows
        .flatMap((synthetic) =>
          regularImportedRows.filter(
            (candidate) =>
              !claimedCandidates.has(candidate.id) &&
              candidate.account_id === synthetic.account_id &&
              candidate.type === synthetic.type &&
              sameAmount(candidate, synthetic) &&
              dayDistance(candidate.date, synthetic.date) <= 7,
          ),
        )
        .sort((left, right) => {
          const referenceDate = syntheticRows[0]?.date ?? left.date;
          return dayDistance(left.date, referenceDate) - dayDistance(right.date, referenceDate);
        });

      if (candidates[0]) claimedCandidates.add(candidates[0].id);

      const status: TransferReconciliationStatus = !validPair
        ? "invalid"
        : importedPair
          ? "reconciled"
          : candidates.length > 0
            ? "candidate"
            : "missing";

      return {
        id,
        outgoing,
        incoming,
        rows,
        candidates,
        status,
        amount: Math.abs(Number(outgoing?.amount ?? incoming?.amount ?? 0)),
        date: outgoing?.date ?? incoming?.date ?? "",
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  return groups;
}
