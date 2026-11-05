import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  brl,
  buildCostStatement,
  buildCostStatementPdf,
  costCell,
  formatDateBR,
  NOT_APPLICABLE,
} from "@/lib/rental-cost-statement";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function OrderCostDialog({ order, open, onOpenChange }: { order: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const st = useMemo(() => buildCostStatement(order), [order]);
  const [busy, setBusy] = useState(false);
  const na = (t: string) => (t === NOT_APPLICABLE ? "text-muted-foreground italic" : "");

  const exportPdf = async () => {
    setBusy(true);
    try {
      const blob = await buildCostStatementPdf(st);
      downloadBlob(blob, `demonstrativo-${st.code || "pedido"}.pdf`);
    } catch (e) {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setBusy(false);
    }
  };

  const heads = ["Peça", "Qtd.", "Dimensões (C × P × A)", "Tipo de queima", "Argila", "Esmalte", "Queima", "Manutenção do forno", "Outros custos", "Frete", "Subtotal", "Total cobrado"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes dos custos · {st.code}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Cliente</p><p className="font-medium">{st.customerName}</p></div>
          <div><p className="text-xs text-muted-foreground">Data do pedido</p><p className="font-medium">{formatDateBR(st.createdAt)}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Vaga / queima</p><p className="font-medium">{st.slotTitle}{st.firingDate ? ` · ${formatDateBR(st.firingDate)}` : ""}</p></div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[960px] text-xs">
            <thead className="bg-muted/50">
              <tr>{heads.map((h) => <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {st.rows.length === 0 ? (
                <tr><td colSpan={12} className="px-2 py-3 text-muted-foreground">Nenhuma peça registrada neste pedido.</td></tr>
              ) : st.rows.map((r, i) => {
                const cells = [costCell(r.clay), costCell(r.glaze), brl(r.firing), costCell(r.maintenance), costCell(r.other), costCell(r.freight)];
                return (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-2 font-medium">{r.piece}</td>
                    <td className="px-2 py-2">{r.quantity}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.dimensions}</td>
                    <td className="px-2 py-2">{r.firingType}</td>
                    {cells.map((c, j) => <td key={j} className={`px-2 py-2 whitespace-nowrap ${na(c)}`}>{c}</td>)}
                    <td className="px-2 py-2 whitespace-nowrap">{brl(r.subtotal)}</td>
                    <td className="px-2 py-2 whitespace-nowrap font-semibold">{brl(r.charged)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Total de custos internos</span><span className="font-medium">{brl(st.internalCosts)}</span></div>
          {st.discount > 0 && <div className="flex justify-between"><span>Desconto</span><span className="font-medium">- {brl(st.discount)}</span></div>}
          <div className="flex justify-between"><span>Total cobrado</span><span className="font-medium">{brl(st.totalCharged)}</span></div>
          <div className="flex justify-between"><span>Já pago</span><span className="font-medium">{brl(st.paid)}</span></div>
          <div className="flex justify-between border-t pt-1 font-semibold text-primary"><span>Saldo a receber</span><span>{brl(st.balance)}</span></div>
        </div>
        <p className="text-xs text-muted-foreground">"Não se aplica" indica custo que não compõe a cobrança deste pedido.</p>
        <DialogFooter>
          <Button onClick={exportPdf} disabled={busy}><FileDown className="mr-2 h-4 w-4" />{busy ? "Gerando..." : "Exportar PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
