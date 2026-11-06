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
      dimensions: dimsPlain(i),
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

export type PdfAssets = {
  logo: Uint8Array;
  regular: Uint8Array;
  bold: Uint8Array;
  mono: Uint8Array;
};

async function loadDefaultAssets(): Promise<PdfAssets> {
  const { default: logoAsset } = await import("@/assets/selo-sela-ceramica.png.asset.json");
  const get = async (u: string) => {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Falha ao carregar ${u}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const [logo, regular, bold, mono] = await Promise.all([
    get(logoAsset.url),
    get("/fonts/cantarell-regular.ttf"),
    get("/fonts/cantarell-bold.ttf"),
    get("/fonts/cutive-mono-regular.ttf"),
  ]);
  return { logo, regular, bold, mono };
}

/** C × P × A values only (unit is in the column header); missing → "Não informado". */
function dimsPlain(item: any): string {
  return [item?.width_cm, item?.depth_cm, item?.height_cm]
    .map((v) => {
      const n = Number(v);
      if (v === null || v === undefined || v === "" || !Number.isFinite(n) || n <= 0) return NOT_INFORMED;
      return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    })
    .join(" × ");
}

export async function buildCostStatementPdf(st: CostStatement, assets?: PdfAssets): Promise<Blob> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const QRCode = (await import("qrcode")).default;
  const { createPixPayload, SELA_PIX_KEY } = await import("@/lib/pix-br");
  const a = assets ?? (await loadDefaultAssets());

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Demonstrativo ${st.code} — Selá Cerâmica`);
  const font = await doc.embedFont(a.regular, { subset: true });
  const bold = await doc.embedFont(a.bold, { subset: true });
  const mono = await doc.embedFont(a.mono, { subset: true });
  const logo = await doc.embedPng(a.logo);

  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const C = {
    ink: hex("#331F24"), wine: hex("#751424"), brown: hex("#5A422E"), gold: hex("#D29538"),
    goldLight: hex("#D89F58"), sand: hex("#E7D1A9"), olive: hex("#B9BC80"), cream: hex("#FEFCEB"),
    white: rgb(1, 1, 1),
  };
  const W = 595.28, H = 841.89, M = 40; // A4 portrait
  let page = doc.addPage([W, H]);
  let y = 0;

  const fit = (text: string, size: number, max: number, f = font) => {
    let t = text;
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + "…";
    return t;
  };
  const wrap = (text: string, size: number, max: number, f = font): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const w of text.split(" ")) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) <= max || !cur) cur = next;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out.map((l) => fit(l, size, max, f));
  };
  const right = (t: string, xr: number, yy: number, size: number, f = font, color = C.ink) =>
    page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y: yy, size, font: f, color });

  const header = (first: boolean) => {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.cream });
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.ink });
    page.drawRectangle({ x: 0, y: H - 9, width: W, height: 3, color: C.gold });
    const L = first ? 76 : 48; // logo size; protection area ≈ letter "E" height around it
    const top = H - 9 - 22;
    page.drawImage(logo, { x: M, y: top - L, width: L, height: L });
    const tx = W - M;
    right("DEMONSTRATIVO DE CUSTOS", tx, top - 14, 8.5, bold, C.brown);
    right(`Pedido ${st.code}`, tx, top - 36, first ? 20 : 14, bold, C.ink);
    right("Selá Queimas · Selá Cerâmica", tx, top - 52, 9, font, C.brown);
    y = top - L - 22;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: C.sand });
    y -= 22;
  };
  header(true);

  // Summary cards
  const meta: [string, string][] = [
    ["Cliente", st.customerName],
    ["Data do pedido", formatDateBR(st.createdAt)],
    ["Vaga", st.slotTitle],
    ["Data da queima", formatDateBR(st.firingDate)],
  ];
  const cw = (W - 2 * M - 8) / 2;
  meta.forEach(([k, v], i) => {
    const x = M + (i % 2) * (cw + 8);
    const yy = y - Math.floor(i / 2) * 50;
    page.drawRectangle({ x, y: yy - 34, width: cw, height: 42, color: C.white, borderColor: C.sand, borderWidth: 0.8 });
    page.drawText(k.toUpperCase(), { x: x + 12, y: yy - 6, size: 7, font: bold, color: C.brown });
    page.drawText(fit(v, 11, cw - 24, bold), { x: x + 12, y: yy - 23, size: 11, font: bold, color: C.ink });
  });
  y -= 124;

  // Pieces table
  page.drawText("Peças", { x: M, y, size: 13, font: bold, color: C.wine });
  y -= 16;
  const cols = [
    { h: "Peça", w: 118 }, { h: "Qtd.", w: 32, r: true }, { h: "C × P × A (cm)", w: 128 },
    { h: "Queima", w: 76 }, { h: "Custo queima", w: 80, r: true }, { h: "Total", w: 81, r: true },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const drawHead = () => {
    page.drawRectangle({ x: M, y: y - 8, width: tableW, height: 22, color: C.ink });
    let x = M;
    cols.forEach((c) => {
      const t = c.h.toUpperCase();
      if (c.r) right(t, x + c.w - 8, y, 7.2, bold, C.cream);
      else page.drawText(t, { x: x + 8, y, size: 7.2, font: bold, color: C.cream });
      x += c.w;
    });
    y -= 28;
  };
  drawHead();
  const items = st.rows;
  items.forEach((r, idx) => {
    const cells = [r.piece, String(r.quantity), r.dimensions.replace(/Não informado/g, "Não\u00a0informado"), r.firingType, brl(r.firing), brl(r.charged)];
    const fonts = cells.map((_, i) => (i === 5 || i === 0 ? bold : font));
    const wrapped = cells.map((t, i) => (cols[i].r ? [t] : wrap(t, 8.8, cols[i].w - 14, fonts[i])));
    const n = Math.max(...wrapped.map((w) => w.length));
    const rh = 12 + n * 11.5;
    if (y - rh < M + 40) { page = doc.addPage([W, H]); header(false); drawHead(); }
    if (idx % 2 === 0) page.drawRectangle({ x: M, y: y - rh + 12, width: tableW, height: rh, color: C.white });
    let x = M;
    wrapped.forEach((ls, i) => {
      const c = cols[i];
      ls.forEach((l, li) => {
        const t = l.replace(/\u00a0/g, " ");
        const color = t.includes(NOT_INFORMED) ? C.brown : C.ink;
        const yy = y - 2 - li * 11.5;
        if (c.r) right(t, x + c.w - 8, yy, 8.8, fonts[i], color);
        else page.drawText(t, { x: x + 8, y: yy, size: 8.8, font: fonts[i], color });
      });
      x += c.w;
    });
    y -= rh;
  });
  if (items.length === 0) {
    page.drawText("Nenhuma peça registrada neste pedido.", { x: M + 8, y, size: 9, font, color: C.brown });
    y -= 24;
  }
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + tableW, y: y + 12 }, thickness: 0.8, color: C.sand });

  // Financial summary + Pix need ~250pt
  if (y < M + 270) { page = doc.addPage([W, H]); header(false); } else y -= 16;

  const boxH = 210;
  const fw = 236;
  page.drawRectangle({ x: M, y: y - boxH, width: fw, height: boxH, color: C.white, borderColor: C.sand, borderWidth: 0.8 });
  let fy = y - 24;
  page.drawText("Resumo financeiro", { x: M + 16, y: fy, size: 12, font: bold, color: C.wine });
  fy -= 26;
  const lines: [string, string][] = [
    ["Total das peças", brl(st.internalCosts)],
    ...(st.discount > 0 ? [["Desconto", `- ${brl(st.discount)}`] as [string, string]] : []),
    ["Total do pedido", brl(st.totalCharged)],
    ["Já pago", brl(st.paid)],
  ];
  lines.forEach(([k, v]) => {
    page.drawText(k, { x: M + 16, y: fy, size: 9.5, font, color: C.brown });
    right(v, M + fw - 16, fy, 9.5, bold, C.ink);
    fy -= 20;
  });
  fy -= 4;
  page.drawRectangle({ x: M + 10, y: fy - 14, width: fw - 20, height: 34, color: C.ink });
  page.drawText("Saldo a receber", { x: M + 20, y: fy, size: 10, font: bold, color: C.cream });
  right(brl(st.balance), M + fw - 20, fy - 1, 13, bold, C.goldLight);

  // Pix block
  const px = M + fw + 14, pw = W - M - px;
  page.drawRectangle({ x: px, y: y - boxH, width: pw, height: boxH, color: C.sand });
  page.drawText("Pagamento via Pix", { x: px + 16, y: y - 24, size: 12, font: bold, color: C.wine });
  if (st.balance > 0) {
    const payload = createPixPayload({
      amount: Math.round(st.balance * 100) / 100,
      studentName: st.customerName,
      description: `Sela Queimas ${st.code}`,
      pixKey: SELA_PIX_KEY,
    });
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 360, color: { dark: "#331F24", light: "#FFFFFF" } });
    const qr = await doc.embedPng(dataUrl);
    const q = 100;
    page.drawRectangle({ x: px + 14, y: y - 44 - q - 4, width: q + 8, height: q + 8, color: C.white });
    page.drawImage(qr, { x: px + 18, y: y - 44 - q, width: q, height: q });
    const ix = px + q + 30, iw = pw - (q + 30) - 10;
    let iy = y - 54;
    const info: [string, string][] = [["Valor", brl(st.balance)], ["Chave Pix (CNPJ)", SELA_PIX_KEY], ["Favorecido", "Selá Cerâmica"]];
    info.forEach(([k, v]) => {
      page.drawText(k.toUpperCase(), { x: ix, y: iy, size: 6.8, font: bold, color: C.brown });
      page.drawText(fit(v, 9.5, iw, bold), { x: ix, y: iy - 13, size: 9.5, font: bold, color: C.ink });
      iy -= 34;
    });
    page.drawText("PIX COPIA E COLA", { x: px + 16, y: y - 176, size: 6.8, font: bold, color: C.brown });
    // wrap payload in mono
    const size = 6.4, maxW = pw - 32;
    const perLine = Math.max(10, Math.floor(maxW / mono.widthOfTextAtSize("0", size)));
    const chunks = payload.match(new RegExp(`.{1,${perLine}}`, "g")) ?? [];
    chunks.slice(0, 3).forEach((c, i) => page.drawText(c, { x: px + 16, y: y - 187 - i * 8, size, font: mono, color: C.ink }));
  } else {
    page.drawText("Pedido quitado — não há saldo a pagar.", { x: px + 16, y: y - 56, size: 10, font: bold, color: C.ink });
  }
  y -= boxH + 26;

  // Footer on every page
  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: M, y: M + 6 }, end: { x: W - M, y: M + 6 }, thickness: 0.6, color: C.olive });
    p.drawText("Selá Cerâmica · autoconhecimento · expressão · refúgio", { x: M, y: M - 8, size: 7.5, font, color: C.brown });
    const t = "Medidas ausentes aparecem como \"Não informado\".";
    p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 7.5), y: M - 8, size: 7.5, font, color: C.brown });
  }
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
