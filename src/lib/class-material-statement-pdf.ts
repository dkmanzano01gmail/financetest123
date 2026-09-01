import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { createPixPayload, SELA_PIX_KEY } from "@/lib/pix-br";

type Statement = {
  student: string;
  period: string;
  charged: number;
  paid: number;
  pending: number;
  clay: number;
  glaze: number;
  firing: number;
  kilnMaintenance: number;
  other: number;
  freight: number;
  pieces: Array<{ piece_name?: string; usage_date?: string; quantity?: number; registeredQuantity?: number; charged?: number; pending?: number }>;
};

const money = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const safe = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export async function createClassMaterialsPdf(statement: Statement, options: { includeCostBreakdown?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 795;
  const write = (text: string, options: { size?: number; font?: PDFFont; x?: number; color?: ReturnType<typeof rgb> } = {}) => {
    const size = options.size ?? 10;
    if (y < 55) {
      page = pdf.addPage([595, 842]);
      y = 795;
    }
    page.drawText(safe(text), { x: options.x ?? 45, y, size, font: options.font ?? regular, color: options.color ?? rgb(0.2, 0.11, 0.12) });
    y -= size + 7;
  };
  const line = () => {
    page.drawLine({ start: { x: 45, y }, end: { x: 550, y }, thickness: 0.6, color: rgb(0.82, 0.72, 0.55) });
    y -= 14;
  };

  write("SELA CERAMICA", { size: 18, font: bold, color: rgb(0.5, 0.04, 0.1) });
  write("Demonstrativo de materiais de aula", { size: 15, font: bold });
  write(`${statement.student} - ${statement.period}`, { size: 11 });
  y -= 4;
  line();
  write(`Total de materiais: ${money(statement.charged)}`, { size: 12, font: bold });
  write(`Ja pago: ${money(statement.paid)}`);
  write(`Valor devido: ${money(statement.pending)}`, { size: 12, font: bold, color: rgb(0.65, 0.08, 0.08) });
  const totalRegisteredQuantity = statement.pieces.reduce(
    (total, piece) => total + Math.max(Number(piece.registeredQuantity ?? piece.quantity ?? 1), Number(piece.quantity ?? 1)),
    0,
  );
  write(`Quantidade cobrada neste demonstrativo: ${statement.pieces.reduce((total, piece) => total + Number(piece.quantity ?? 1), 0)} de ${totalRegisteredQuantity} pecas registradas.`, { size: 10, font: bold });
  if (options.includeCostBreakdown !== false) {
    y -= 4;
    write(`Argila: ${money(statement.clay)}   Esmalte: ${money(statement.glaze)}   Queimas: ${money(statement.firing)}`);
    write(`Manutencao do forno: ${money(statement.kilnMaintenance)}   Outros: ${money(statement.other)}   Frete: ${money(statement.freight)}`);
  }
  y -= 5;
  line();
  write("Itens", { size: 12, font: bold });
  for (const piece of statement.pieces) {
    const chargedQuantity = Number(piece.quantity ?? 1);
    const registeredQuantity = Math.max(Number(piece.registeredQuantity ?? chargedQuantity), chargedQuantity);
    write(`${piece.usage_date ?? ""}  ${piece.piece_name || "Peca sem nome"}`, { size: 9, font: bold });
    write(`Quantidade cobrada: ${chargedQuantity} de ${registeredQuantity} unidades registradas.  Cobrado: ${money(Number(piece.charged || 0))}  Pendente: ${money(Number(piece.pending || 0))}`, { size: 9 });
  }

  let pixPayload: string | null = null;
  if (statement.pending > 0) {
    pixPayload = createPixPayload({ amount: statement.pending, studentName: statement.student });
    y -= 6;
    line();
    write("PAGAMENTO VIA PIX", { size: 13, font: bold });
    write(`Valor: ${money(statement.pending)}`, { size: 11, font: bold });
    const qrDataUrl = await QRCode.toDataURL(pixPayload, { errorCorrectionLevel: "M", margin: 1, width: 500 });
    const qr = await pdf.embedPng(qrDataUrl);
    if (y < 245) {
      page = pdf.addPage([595, 842]);
      y = 795;
    }
    page.drawImage(qr, { x: 45, y: y - 150, width: 150, height: 150 });
    page.drawText("Pix Copia e Cola:", { x: 215, y: y - 10, size: 10, font: bold });
    const chunks = pixPayload.match(/.{1,48}/g) ?? [pixPayload];
    chunks.forEach((chunk, index) => page.drawText(chunk, { x: 215, y: y - 28 - index * 12, size: 7, font: regular }));
    page.drawText(`Chave Pix: ${SELA_PIX_KEY}`, { x: 215, y: y - 118, size: 9, font: regular });
    y -= 170;
  } else {
    y -= 6;
    write("Nao ha valor pendente; nenhuma cobranca Pix foi gerada.", { size: 10, font: bold });
  }
  const bytes = await pdf.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), pixPayload };
}
