import { RENTAL_FIRING_TYPE } from "@/lib/rental";

export const NOT_INFORMED = "Não informado";
export const NOT_APPLICABLE = "Não se aplica";

export function formatDimension(value: unknown): string {
  if (value === null || value === undefined || value === "") return NOT_INFORMED;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return NOT_INFORMED;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} cm`;
}

export function formatDimensionsCPA(item: any): string {
  return [item?.width_cm, item?.depth_cm, item?.height_cm].map(formatDimension).join(" × ");
}

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type CostRow = {
  piece: string;
  quantity: number;
  dimensions: string;
  firingType: string;
  clay: number | null;
  glaze: number | null;
  firing: number;
  maintenance: number | null;
  other: number | null;
  freight: number | null;
  subtotal: number;
  charged: number;
};

export type CostStatement = {
  code: string;
  customerName: string;
  createdAt: string | null;
  slotTitle: string;
  firingDate: string | null;
  rows: CostRow[];
  discount: number;
  internalCosts: number;
  totalCharged: number;
  paid: number;
  balance: number;
};

/** Builds the statement only from data already stored on the order. */
export function buildCostStatement(order: any): CostStatement {
  const firingType =
    RENTAL_FIRING_TYPE[order?.rental_slots?.firing_type] ?? order?.rental_slots?.firing_type ?? NOT_INFORMED;
  const rows: CostRow[] = (order?.rental_order_items ?? []).map((i: any) => {
    const qty = toNum(i.quantity) || 1;
    const total = i.total_price != null ? toNum(i.total_price) : toNum(i.unit_price) * qty;
    return {
      piece: i.piece_name || "Peça",
      quantity: qty,
      dimensions: formatDimensionsCPA(i),
      firingType,
      clay: null,
      glaze: null,
      firing: total,
      maintenance: null,
      other: null,
      freight: null,
      subtotal: total,
      charged: total,
    };
  });
  const itemsTotal = rows.reduce((s, r) => s + r.charged, 0);
  const totalCharged = order?.total != null ? toNum(order.total) : itemsTotal;
  const discount = toNum(order?.discount);
  const paid = (order?.rental_payments ?? [])
    .filter((p: any) => p.status === "paid")
    .reduce((s: number, p: any) => s + toNum(p.amount), 0);
  return {
    code: order?.code ?? "",
    customerName: order?.rental_customers?.name ?? NOT_INFORMED,
    createdAt: order?.created_at ?? null,
    slotTitle: order?.rental_slots?.title ?? NOT_INFORMED,
    firingDate: order?.rental_slots?.firing_date ?? null,
    rows,
    discount,
    internalCosts: rows.reduce((s, r) => s + r.subtotal, 0),
    totalCharged,
    paid,
    balance: Math.max(0, totalCharged - paid),
  };
}

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const costCell = (n: number | null) => (n === null ? NOT_APPLICABLE : brl(n));

export function formatDateBR(value: string | null): string {
  if (!value) return NOT_INFORMED;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? NOT_INFORMED : d.toLocaleDateString("pt-BR");
}

export async function buildCostStatementPdf(st: CostStatement): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 32; // A4 landscape
  const clay = rgb(0.55, 0.3, 0.2), ink = rgb(0.15, 0.13, 0.12), muted = rgb(0.45, 0.42, 0.4), line = rgb(0.85, 0.8, 0.76);
  let page = doc.addPage([W, H]);
  let y = H - M;

  const fit = (text: string, size: number, max: number, f = font) => {
    let t = text;
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + "…";
    return f.widthOfTextAtSize(t, size) > max ? t.replace("…", "") : t;
  };
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: clay });
    page.drawText("Selá Queimas", { x: M, y: H - M - 6, size: 20, font: bold, color: clay });
    page.drawText("Demonstrativo de custos", { x: M, y: H - M - 24, size: 11, font, color: muted });
    y = H - M - 48;
  };
  header();
  const meta: [string, string][] = [
    ["Cliente", st.customerName],
    ["Pedido", st.code],
    ["Data do pedido", formatDateBR(st.createdAt)],
    ["Vaga / queima", `${st.slotTitle}${st.firingDate ? ` · ${formatDateBR(st.firingDate)}` : ""}`],
  ];
  const colW = 150;
  meta.forEach(([k, v], i) => {
    const mw = i === 3 ? W - 2 * M - 3 * colW : colW - 8;
    page.drawText(k, { x: M + i * colW, y, size: 8, font, color: muted });
    page.drawText(fit(v, 10, mw, bold), { x: M + i * colW, y: y - 13, size: 10, font: bold, color: ink });
  });
  y -= 36;

  const cols = [
    { h: "Peça", w: 82 }, { h: "Qtd.", w: 30 }, { h: "Dimensões (C × P × A)", w: 175 },
    { h: "Tipo", w: 58 }, { h: "Argila", w: 50 }, { h: "Esmalte", w: 50 },
    { h: "Queima", w: 54 }, { h: "Manut. forno", w: 54 }, { h: "Outros", w: 50 },
    { h: "Frete", w: 50 }, { h: "Subtotal", w: 54 }, { h: "Total cobrado", w: 70 },
  ];
  const drawHead = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 18, color: rgb(0.96, 0.93, 0.9) });
    let x = M + 3;
    cols.forEach((c) => { page.drawText(fit(c.h, 7.5, c.w - 4, bold), { x, y, size: 7.5, font: bold, color: ink }); x += c.w; });
    y -= 20;
  };
  drawHead();
  st.rows.forEach((r) => {
    if (y < M + 110) { page = doc.addPage([W, H]); header(); drawHead(); }
    const cells = [r.piece, String(r.quantity), r.dimensions, r.firingType, costCell(r.clay), costCell(r.glaze),
      brl(r.firing), costCell(r.maintenance), costCell(r.other), costCell(r.freight), brl(r.subtotal), brl(r.charged)];
    let x = M + 3;
    cells.forEach((t, i) => {
      const f = i === 11 ? bold : font;
      page.drawText(fit(t, 7.5, cols[i].w - 4, f), { x, y, size: 7.5, font: f, color: t === "Não se aplica" || t.includes(NOT_INFORMED) ? muted : ink });
      x += cols[i].w;
    });
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: W - M, y: y - 6 }, thickness: 0.5, color: line });
    y -= 18;
  });
  if (st.rows.length === 0) {
    page.drawText("Nenhuma peça registrada neste pedido.", { x: M + 3, y, size: 9, font, color: muted });
    y -= 18;
  }
  if (y < M + 100) { page = doc.addPage([W, H]); header(); }
  y -= 10;
  const summary: [string, string][] = [
    ["Total de custos", brl(st.internalCosts)],
    ...(st.discount > 0 ? [["Desconto", `- ${brl(st.discount)}`] as [string, string]] : []),
    ["Total cobrado", brl(st.totalCharged)],
    ["Já pago", brl(st.paid)],
    ["Saldo a receber", brl(st.balance)],
  ];
  const sx = W - M - 220;
  summary.forEach(([k, v], i) => {
    const last = i === summary.length - 1;
    page.drawText(k, { x: sx, y, size: 10, font: last ? bold : font, color: last ? clay : ink });
    const vw = bold.widthOfTextAtSize(v, 10);
    page.drawText(v, { x: W - M - vw, y, size: 10, font: bold, color: last ? clay : ink });
    y -= 16;
  });
  page.drawText("\"Não se aplica\" indica custo que não compõe a cobrança deste pedido.", { x: M, y: M + 8, size: 7.5, font, color: muted });
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
