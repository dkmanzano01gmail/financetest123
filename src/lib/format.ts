export function formatCurrency(value: number | null | undefined, currency = "BRL", privacy = false) {
  if (privacy) return "•••••";
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

export function monthLabel(m: number) {
  return ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m-1] ?? "";
}
