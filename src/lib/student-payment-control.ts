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
  confidence: "high" | "medium" | "low";
  score: number;
  reasons: string[];
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

const NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

function nameTokens(value: string) {
  return normalizePaymentText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !NAME_PARTICLES.has(token));
}

function tokensMatch(left: string, right: string) {
  return (
    left === right ||
    (Math.min(left.length, right.length) >= 4 && (left.startsWith(right) || right.startsWith(left)))
  );
}

function scoreNameMatch(
  candidate: PaymentCandidate,
  studentName: string,
  allStudentNames: string[],
) {
  const haystack = normalizePaymentText(
    `${candidate.description ?? ""} ${candidate.counterparty ?? ""}`,
  );
  const candidateTokens = haystack.split(" ").filter(Boolean);
  const studentTokens = nameTokens(studentName);
  if (!haystack || studentTokens.length === 0) return null;

  const matched = studentTokens.filter((studentToken) =>
    candidateTokens.some((candidateToken) => tokensMatch(studentToken, candidateToken)),
  );
  if (matched.length === 0) return null;

  const normalizedName = normalizePaymentText(studentName);
  if (haystack.includes(normalizedName)) {
    return { score: 70, reason: "nome completo encontrado" };
  }

  const first = studentTokens[0];
  const last = studentTokens.at(-1);
  if (
    studentTokens.length > 1 &&
    matched.some((token) => token === first) &&
    matched.some((token) => token === last)
  ) {
    return { score: 62, reason: "nome e sobrenome encontrados" };
  }

  if (matched.length >= 2) {
    return {
      score: 46 + Math.round((matched.length / studentTokens.length) * 10),
      reason: `${matched.length} partes do nome encontradas`,
    };
  }

  const onlyMatch = matched[0];
  const studentsWithToken = allStudentNames.filter((name) =>
    nameTokens(name).some((token) => tokensMatch(token, onlyMatch)),
  ).length;
  if (onlyMatch.length >= 4 && studentsWithToken === 1) {
    return { score: 38, reason: `parte exclusiva do nome encontrada: ${onlyMatch}` };
  }

  return null;
}

const TUITION_TERMS = ["mensalidade", "mensal", "aula", "curso"];
const MATERIAL_TERMS = ["material", "materiais", "argila", "esmalte", "queima", "peca"];

function kindLabel(kind: PaymentSuggestionKind) {
  if (kind === "tuition") return "mensalidade";
  if (kind === "materials") return "materiais";
  return "mensalidade + materiais";
}

function descriptionKind(candidate: PaymentCandidate) {
  const text = normalizePaymentText(
    `${candidate.description ?? ""} ${candidate.counterparty ?? ""}`,
  );
  const tuition = TUITION_TERMS.some((term) => text.includes(term));
  const materials = MATERIAL_TERMS.some((term) => text.includes(term));
  if (tuition && materials) return "combined" as const;
  if (tuition) return "tuition" as const;
  if (materials) return "materials" as const;
  return null;
}

function valueScore(amount: number, target: number) {
  const difference = Math.abs(amount - target);
  const ratio = target > 0 ? difference / target : Number.POSITIVE_INFINITY;
  if (difference <= 0.02) return { score: 36, reason: "valor exato" };
  if (difference <= 1 || ratio <= 0.01) return { score: 31, reason: "valor praticamente igual" };
  if (difference <= 5 || ratio <= 0.03) return { score: 23, reason: "valor muito próximo" };
  if (ratio <= 0.1) return { score: 11, reason: "valor próximo" };
  if (ratio <= 0.2) return { score: 3, reason: "valor aproximado" };
  return null;
}

export function findPaymentSuggestions(input: {
  studentName: string;
  tuitionDue: number;
  materialsDue: number;
  transactions: PaymentCandidate[];
  allStudentNames?: string[];
}) {
  const targets: Array<{ kind: PaymentSuggestionKind; amount: number }> = [];
  if (input.tuitionDue > 0) targets.push({ kind: "tuition", amount: input.tuitionDue });
  if (input.materialsDue > 0) targets.push({ kind: "materials", amount: input.materialsDue });
  if (input.tuitionDue > 0 && input.materialsDue > 0) {
    targets.push({ kind: "combined", amount: input.tuitionDue + input.materialsDue });
  }

  const suggestions: PaymentSuggestion[] = [];
  const allStudentNames = input.allStudentNames?.length
    ? input.allStudentNames
    : [input.studentName];

  for (const transaction of input.transactions) {
    const nameMatch = scoreNameMatch(transaction, input.studentName, allStudentNames);
    if (!nameMatch) continue;
    const amount = Math.abs(Number(transaction.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const indicatedKind = descriptionKind(transaction);
    for (const target of targets) {
      const difference = Math.abs(amount - target.amount);
      const valueMatch = valueScore(amount, target.amount);
      if (!valueMatch) continue;
      if (valueMatch.score === 3 && nameMatch.score < 60) continue;

      const kindMatches = indicatedKind === target.kind;
      const kindConflicts = indicatedKind && indicatedKind !== target.kind;
      const score =
        nameMatch.score + valueMatch.score + (kindMatches ? 12 : kindConflicts ? -8 : 0);
      if (score < 60) continue;
      const reasons = [nameMatch.reason, valueMatch.reason];
      if (kindMatches) reasons.push(`descrição indica ${kindLabel(target.kind)}`);
      suggestions.push({
        transaction,
        kind: target.kind,
        targetAmount: target.amount,
        difference,
        score,
        confidence: score >= 98 ? "high" : score >= 78 ? "medium" : "low",
        reasons,
      });
    }
  }

  suggestions.sort(
    (left, right) =>
      right.score - left.score ||
      left.difference - right.difference ||
      String(right.transaction.date ?? "").localeCompare(String(left.transaction.date ?? "")),
  );

  const selected: PaymentSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (selected.some((item) => item.transaction.id === suggestion.transaction.id)) continue;
    if (selected.some((item) => item.kind === suggestion.kind || item.kind === "combined"))
      continue;
    if (suggestion.kind === "combined" && selected.length > 0) continue;
    selected.push(suggestion);
    if (suggestion.kind === "combined" || selected.length === 2) break;
  }
  return selected;
}

export function findPaymentSuggestion(input: Parameters<typeof findPaymentSuggestions>[0]) {
  return findPaymentSuggestions(input)[0] ?? null;
}
