export function formatCurrency(
  value: number | null | undefined,
  currency = "BRL",
  privacy = false,
) {
  if (privacy) return "•••••";
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date =
    typeof d === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

export function monthLabel(m: number) {
  return (
    ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][m - 1] ??
    ""
  );
}

/**
 * Locale-safe amount parsing. Accepts:
 *  - "1.234,56" (BR)  → 1234.56
 *  - "1,234.56" (US)  → 1234.56
 *  - "1234,5"         → 1234.5
 *  - "-R$ 12,00"      → -12
 * Returns NaN when the input isn't a finite number.
 */
export function parseLocaleAmount(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return NaN;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  const neg = /^\s*-/.test(s) || /\(.+\)/.test(s);
  s = s.replace(/[^\d.,-]/g, "").replace(/[()\s-]/g, "");
  if (!s || !/\d/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Comma is decimal separator if it has 1-2 trailing digits, otherwise thousands.
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -Math.abs(n) : n;
}
