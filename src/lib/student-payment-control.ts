export type PaymentSuggestionKind = "tuition" | "materials" | "combined";

export type PaymentCandidate = {
  id: string;
  amount: number;
  description?: string | null;
  counterparty?: string | null;
  date?: string | null;
  method?: string | null;
};

export type PaymentSuggestion = {
  transaction: PaymentCandidate;
  kind: PaymentSuggestionKind;
  targetAmount: number;
  difference: number;
};

export function getMaterialReferencePeriod(paymentYear: number, paymentMonth: number) {
  const reference = new Date(paymentYear, paymentMonth - 2, 1);
  return { year: reference.getFullYear(), month: reference.getMonth() + 1 };
}

export function allocateMaterialPayment(
  charges: Array<{ id: string; amount: number }>,
  paidTotal: number,
) {
  let remaining = Math.max(0, paidTotal);
  return charges.map((charge) => {
    const amount = Math.max(0, Number(charge.amount) || 0);
    const paid = Math.min(amount, remaining);
    remaining = Math.max(0, remaining - paid);
    return {
      id: charge.id,
      amountPaid: paid,
      amountPending: Math.max(0, amount - paid),
      status: paid <= 0 ? "pending" : paid < amount ? "partial" : "paid",
    };
  });
}

export function normalizePaymentText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mentionsStudent(candidate: PaymentCandidate, studentName: string) {
  const haystack = normalizePaymentText(
    `${candidate.description ?? ""} ${candidate.counterparty ?? ""}`,
  );
  const haystackTokens = new Set(haystack.split(" ").filter(Boolean));
  const tokens = normalizePaymentText(studentName)
    .split(" ")
    .filter((token) => token.length >= 3);
  if (!haystack || tokens.length === 0) return false;
  if (haystack.includes(normalizePaymentText(studentName))) return true;
  const first = tokens[0];
  const last = tokens.at(-1);
  return haystackTokens.has(first) && (!last || last === first || haystackTokens.has(last));
}

export function findPaymentSuggestion(input: {
  studentName: string;
  tuitionDue: number;
  materialsDue: number;
  transactions: PaymentCandidate[];
}) {
  const targets: Array<{ kind: PaymentSuggestionKind; amount: number }> = [];
  if (input.tuitionDue > 0) targets.push({ kind: "tuition", amount: input.tuitionDue });
  if (input.materialsDue > 0) targets.push({ kind: "materials", amount: input.materialsDue });
  if (input.tuitionDue > 0 && input.materialsDue > 0) {
    targets.push({ kind: "combined", amount: input.tuitionDue + input.materialsDue });
  }

  let best: PaymentSuggestion | null = null;
  for (const transaction of input.transactions) {
    if (!mentionsStudent(transaction, input.studentName)) continue;
    const amount = Math.abs(Number(transaction.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    for (const target of targets) {
      const difference = Math.abs(amount - target.amount);
      const tolerance = Math.max(5, target.amount * 0.03);
      if (difference > tolerance) continue;
      if (!best || difference < best.difference) {
        best = { transaction, kind: target.kind, targetAmount: target.amount, difference };
      }
    }
  }
  return best;
}
