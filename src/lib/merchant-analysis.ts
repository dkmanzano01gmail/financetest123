export type MerchantAnalysisTransaction = {
  id: string;
  amount: number | string;
  description?: string | null;
  counterparty?: string | null;
};

export type MerchantAnalysisGroup = {
  key: string;
  name: string;
  count: number;
  total: number;
  average: number;
  share: number;
};

export type MerchantAnalysis = {
  transactionCount: number;
  merchantCount: number;
  total: number;
  groups: MerchantAnalysisGroup[];
};

const GENERIC_TOKENS = new Set([
  "brasil",
  "cartao",
  "compra",
  "credito",
  "debito",
  "ltda",
  "mastercard",
  "online",
  "pagamento",
  "pagto",
  "parcela",
  "pix",
  "visa",
]);

export function normalizeMerchantIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:parc(?:ela)?|prestacao)\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/g, " ")
    .replace(/(?:^|\s)\d{1,2}\s*\/\s*\d{1,2}\s*$/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b(?:compra no|compra|pagamento|pagto|pix|debito automatico)\b/g, " ")
    .replace(/\b(?:final\s+)?(?:x{2,}|\*{2,})\d{2,4}\b/g, " ")
    .replace(/\b[a-f0-9]{12,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !GENERIC_TOKENS.has(token))
    .join(" ")
    .trim();
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function merchantIdentity(transaction: MerchantAnalysisTransaction): { key: string; name: string } {
  const source = transaction.counterparty?.trim() || transaction.description?.trim() || "";
  const normalized = normalizeMerchantIdentity(source);
  const key = normalized || "nao identificado";
  return {
    key,
    name: normalized ? titleCase(normalized) : "Não identificado",
  };
}

export function analyzeTransactionsByMerchant(
  transactions: MerchantAnalysisTransaction[],
): MerchantAnalysis {
  const groups = new Map<string, Omit<MerchantAnalysisGroup, "average" | "share">>();

  for (const transaction of transactions) {
    const { key, name } = merchantIdentity(transaction);
    const amount = Math.abs(Number(transaction.amount) || 0);
    const current = groups.get(key);

    if (current) {
      current.count += 1;
      current.total += amount;
    } else {
      groups.set(key, { key, name, count: 1, total: amount });
    }
  }

  const total = [...groups.values()].reduce((sum, group) => sum + group.total, 0);
  const ranked = [...groups.values()]
    .map((group) => ({
      ...group,
      average: group.count ? group.total / group.count : 0,
      share: total ? group.total / total : 0,
    }))
    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name));

  return {
    transactionCount: transactions.length,
    merchantCount: ranked.length,
    total,
    groups: ranked,
  };
}
