import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import logoAsset from "@/assets/selo-sela-ceramica.png.asset.json";
import { createPixPayload, SELA_PIX_KEY } from "@/lib/pix-br";

export type StatementPiece = {
  piece_name?: string; usage_date?: string; quantity?: number; registeredQuantity?: number;
  length_cm?: number | string | null; depth_cm?: number | string | null; height_cm?: number | string | null;
  modeled_weight_g?: number | null; grams?: number; clay_weight_kg?: number; bisque_weight_g?: number | null;
  glazed_weight_g?: number | null; glaze_quantity?: number | null; clay_type?: string; glaze_name?: string;
  glaze_cone?: string; resistance_only?: boolean; payment_status?: string; photo_url?: string;
  clay?: number; glaze?: number; firing?: number; kilnMaintenance?: number; other?: number; freight?: number;
  calculated?: number; charged?: number; paid?: number; pending?: number;
};
export type Statement = {
  student: string; group?: string; period: string; charged: number; paid: number; pending: number;
  calculated?: number; clay: number; glaze: number; firing: number; kilnMaintenance: number; other: number;
  freight: number; pieces: StatementPiece[];
};
export type StatementPdfAssets = { logo: Uint8Array; regular: Uint8Array; bold: Uint8Array };
type Options = { includeCostBreakdown?: boolean; includePhotos?: boolean; issuedAt?: Date; assets?: StatementPdfAssets };
const money = (value: number) => `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
export const dimensionValue = (value: unknown) => {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) || n <= 0 ? "Não informado" : number(n);
};
export const pieceDimensions = (piece: StatementPiece) =>
  [piece.length_cm, piece.depth_cm, piece.height_cm].map(dimensionValue).join(" × ");
const components = [
  ["Argila", "clay"], ["Esmalte", "glaze"], ["Queimas", "firing"],
  ["Manutenção do forno", "kilnMaintenance"], ["Outros custos", "other"], ["Frete", "freight"],
] as const;
const status = (piece: StatementPiece) => {
  const labels: Record<string, string> = { paid: "Pago", partial: "Parcial", pending: "Pendente", waived: "Isento" };
  return [labels[piece.payment_status ?? "pending"] ?? "Pendente", piece.resistance_only ? "Somente resistências" : ""].filter(Boolean).join(" · ");
};

// Named brand palette shared by all drawing operations (PDF has no browser CSS).
const color = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const palette = { ink: color("#331F24"), wine: color("#751424"), brown: color("#5A422E"), sand: color("#E7D1A9"), cream: color("#FEFCEB") };
const W = 595.28, H = 841.89, M = 40, BOTTOM = 66, WIDTH = W - M * 2;

/** Font-measured wrapping, including unbroken URLs/names; never truncates text. */
export function wrapPdfText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      const next = line + char;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      const space = line.lastIndexOf(" ");
      if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1) + char; }
      else { if (line) lines.push(line); line = char; }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

async function loadAssets(): Promise<StatementPdfAssets> {
  const get = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Não foi possível carregar a logo ou as fontes do demonstrativo.");
    return new Uint8Array(await res.arrayBuffer());
  };
  const [logo, regular, bold] = await Promise.all([
    get(logoAsset.url), get("/fonts/cantarell-regular.ttf"), get("/fonts/cantarell-bold.ttf"),
  ]);
  return { logo, regular, bold };
}

/** The same embedded-font A4 document is downloaded, emailed and shared, independent of browser layout. */
export async function createClassMaterialsPdf(statement: Statement, options: Options = {}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const assets = options.assets ?? await loadAssets();
  const regular = await pdf.embedFont(assets.regular, { subset: true });
  const bold = await pdf.embedFont(assets.bold, { subset: true });
  const logo = await pdf.embedPng(assets.logo);
  const issuedAt = options.issuedAt ?? new Date();
  pdf.setTitle(`Material Aulas — ${statement.student} — Selá Cerâmica`);
  pdf.setAuthor("Selá Cerâmica");
  pdf.setCreationDate(issuedAt);
  pdf.setModificationDate(issuedAt);
  let page: PDFPage = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: palette.cream });
  let y = H - M;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: palette.cream });
    y = H - M;
  };
  const ensure = (height: number) => { if (y - height < BOTTOM) newPage(); };
  const text = (value: string, size = 10, strong = false, width = WIDTH) => {
    const font = strong ? bold : regular;
    for (const line of wrapPdfText(value, font, size, width)) {
      ensure(size + 5);
      page.drawText(line, { x: M, y: y - size, font, size, color: strong ? palette.wine : palette.ink });
      y -= size + 5;
    }
  };
  const heading = (value: string) => { ensure(52); y -= 12; text(value, 13, true); y -= 5; };

  // Stable table tracks with auto-height rows. A very tall row splits into line groups;
  // a repeated column header always precedes its continuation, above the footer boundary.
  const table = (headers: string[], widths: number[], rows: string[][], size = 9) => {
    const draw = (cells: string[][], header: boolean) => {
      const count = Math.max(1, ...cells.map((cell) => cell.length));
      const height = count * (size + 4) + 12;
      page.drawRectangle({ x: M, y: y - height, width: WIDTH, height, color: header ? palette.sand : palette.cream });
      let x = M;
      cells.forEach((cell, col) => {
        cell.forEach((line, i) => page.drawText(line, { x: x + 7, y: y - 7 - size - i * (size + 4), size, font: header ? bold : regular, color: palette.ink }));
        x += widths[col] ?? 0;
      });
      y -= height;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: palette.sand });
    };
    const headerLines = headers.map((h, i) => wrapPdfText(h, bold, size, (widths[i] ?? 0) - 14));
    const headerHeight = Math.max(...headerLines.map((cell) => cell.length)) * (size + 4) + 12;
    ensure(headerHeight + size + 16);
    draw(headerLines, true);
    for (const row of rows) {
      const cells = row.map((cell, i) => wrapPdfText(cell, regular, size, (widths[i] ?? 0) - 14));
      let remaining = Math.max(...cells.map((cell) => cell.length));
      let offset = 0;
      const fullHeight = remaining * (size + 4) + 12;
      if (y - fullHeight < BOTTOM && fullHeight + headerHeight <= H - M - BOTTOM) { newPage(); draw(headerLines, true); }
      while (remaining > 0) {
        let capacity = Math.floor((y - BOTTOM - 12) / (size + 4));
        if (capacity < 1) { newPage(); draw(headerLines, true); capacity = Math.floor((y - BOTTOM - 12) / (size + 4)); }
        const count = Math.min(capacity, remaining);
        draw(cells.map((cell) => cell.slice(offset, offset + count)), false);
        remaining -= count;
        offset += count;
        if (remaining) { newPage(); draw(headerLines, true); }
      }
    }
    y -= 6;
  };

  const logoSize = logo.scaleToFit(76, 76);
  page.drawImage(logo, { x: M + 10, y: y - 76, ...logoSize });
  page.drawText("Material Aulas", { x: M + 110, y: y - 28, size: 22, font: bold, color: palette.wine });
  page.drawText("Demonstrativo de custos", { x: M + 110, y: y - 50, size: 11, font: regular, color: palette.brown });
  y -= 96;
  text(`Aluno: ${statement.student}`, 12, true);
  text(`Turma: ${statement.group || "Aulas regulares"}`);
  text(`Período: ${statement.period}`);
  text(`Emissão: ${issuedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  heading("Resumo financeiro");
  const quantity = statement.pieces.reduce((total, piece) => total + Number(piece.quantity ?? 1), 0);
  table(["Peças cobradas", "Custo total", "Já pago", "Saldo a pagar"], [123, 131, 130, WIDTH - 384],
    [[number(quantity), money(statement.charged), money(statement.paid), money(statement.pending)]], 10);
  heading("Peças incluídas nesta cobrança");
  table(["Peça", "Qtd.", "C × P × A (cm)", "Custo / un.", "Total da peça"], [142, 37, 134, 98, WIDTH - 411],
    statement.pieces.map((piece) => [`${piece.piece_name || "Peça sem nome"}\n${status(piece)}`, number(piece.quantity ?? 1), pieceDimensions(piece), money(Number(piece.charged || 0) / Math.max(1, piece.quantity ?? 1)), money(Number(piece.charged || 0))]));
  if (options.includeCostBreakdown !== false) {
    heading("Componentes cobrados");
    table(["Componente", "Subtotal", "Componente", "Subtotal"], [154, 103, 154, WIDTH - 411], [0, 1, 2].map((i) => {
      const left = components[i];
      const right = components[i + 3];
      if (!left || !right) return [];
      return [left[0], money(statement[left[1]]), right[0], money(statement[right[1]])];
    }));
  }
  text("Os valores correspondem às unidades selecionadas neste demonstrativo.", 9);

  newPage();
  heading("Detalhamento das peças");
  for (const [index, piece] of statement.pieces.entries()) {
    // Reserve a complete ordinary block; long names/comments still flow safely.
    ensure(options.includeCostBreakdown === false ? 220 : 460);
    heading(`${index + 1}. ${piece.piece_name || "Peça sem nome"}`);
    text(status(piece), 9, true);
    text(`Quantidade cobrada: ${number(piece.quantity ?? 1)} · Registrada: ${number(piece.registeredQuantity ?? piece.quantity ?? 1)}`);
    text(`Dimensões C × P × A: ${pieceDimensions(piece)} cm`);
    const weight = (value: unknown) => `${dimensionValue(value)}${Number(value) > 0 ? " g" : ""}`;
    text(`Pesos — modelagem: ${weight(piece.modeled_weight_g ?? piece.grams ?? (piece.clay_weight_kg == null ? null : piece.clay_weight_kg * 1000))}; biscoito: ${weight(piece.bisque_weight_g)}; após esmaltação: ${weight(piece.glazed_weight_g)}.`, 9);
    text(`Argila: ${piece.clay_type || "Não informado"} · Esmalte: ${piece.glaze_name || "Não informado"} · Cone: ${piece.glaze_cone || "Não informado"}`, 9);
    if (options.includePhotos && piece.photo_url) {
      // Optional photo failure cannot prevent downloading a financial statement.
      try {
        const response = await fetch(piece.photo_url);
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          const image = response.headers.get("content-type")?.includes("png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          const scaled = image.scaleToFit(100, 100);
          ensure(scaled.height + 12);
          page.drawImage(image, { x: M, y: y - scaled.height, ...scaled });
          y -= scaled.height + 12;
        }
      } catch { /* Non-PDF-compatible optional image: keep the statement available. */ }
    }
    if (options.includeCostBreakdown !== false) {
      table(["Componente", "Base / unidade", "Valor / unidade", "Subtotal"], [170, 124, 110, WIDTH - 404],
        components.map(([label, key]) => {
          const subtotal = Number(piece[key] || 0);
          const q = Math.max(1, piece.quantity ?? 1);
          return [label, `${number(q)} peça(s)`, money(subtotal / q), money(subtotal)];
        }));
    }
    table(["Calculado", "Cobrado", "Pago", "Pendente"], [128, 129, 128, WIDTH - 385], [[money(Number(piece.calculated ?? piece.charged ?? 0)), money(Number(piece.charged || 0)), money(Number(piece.paid || 0)), money(Number(piece.pending || 0))]], 10);
  }

  let pixPayload: string | null = null;
  if (statement.pending > 0) {
    pixPayload = createPixPayload({ amount: statement.pending, studentName: statement.student });
    const qr = await pdf.embedPng(await QRCode.toDataURL(pixPayload, { errorCorrectionLevel: "M", margin: 2, width: 500 }));
    ensure(240);
    heading("Pagamento via Pix");
    text(`Saldo a pagar: ${money(statement.pending)}`, 12, true);
    page.drawImage(qr, { x: M, y: y - 128, width: 128, height: 128 });
    const chunks = wrapPdfText(pixPayload, regular, 8, WIDTH - 155);
    page.drawText("Pix copia e cola", { x: M + 150, y: y - 12, size: 10, font: bold, color: palette.wine });
    chunks.forEach((chunk, i) => page.drawText(chunk, { x: M + 150, y: y - 30 - i * 12, size: 8, font: regular, color: palette.ink }));
    y -= Math.max(140, 42 + chunks.length * 12);
    text(`Chave Pix: ${SELA_PIX_KEY}`, 9);
  } else { ensure(40); heading("Pedido quitado — nenhum Pix gerado"); }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 48 }, end: { x: W - M, y: 48 }, thickness: 0.6, color: palette.sand });
    p.drawText("Selá Cerâmica · WhatsApp +55 11 93924-1904", { x: M, y: 31, size: 8, font: regular, color: palette.brown });
    const pagination = `${i + 1} / ${pages.length}`;
    p.drawText(pagination, { x: W - M - regular.widthOfTextAtSize(pagination, 8), y: 31, size: 8, font: regular, color: palette.brown });
  });
  const bytes = await pdf.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), pixPayload };
}