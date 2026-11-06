import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Calculator } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, parseLocaleAmount } from "@/lib/format";
import {
  type EditableItem,
  hasPaidPayment,
  itemTotal,
  itemVolume,
  orderTotals,
  reconcilePayments,
  suggestedUnitPrice,
} from "@/lib/rental-order-edit";
import { toNumber } from "@/lib/rental";

const sb = supabase as any;
const str = (v: unknown) => (v == null || Number(v) === 0 ? "" : String(v).replace(".", ","));

export function OrderEditDialog({
  order,
  slots,
  wsId,
  currency,
  onClose,
}: {
  order: any;
  slots: any[];
  wsId: string;
  currency: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const payments: any[] = order.rental_payments ?? [];
  const paidExists = hasPaidPayment(payments);
  const [customer, setCustomer] = useState({
    name: order.rental_customers?.name ?? "",
    studio_name: order.rental_customers?.studio_name ?? "",
    email: order.rental_customers?.email ?? "",
    phone: order.rental_customers?.phone ?? "",
  });
  const [slotId, setSlotId] = useState<string>(order.slot_id);
  const [pickup, setPickup] = useState<string>(order.estimated_pickup_date ?? "");
  const [notes, setNotes] = useState<string>(order.notes ?? "");
  const [discount, setDiscount] = useState<string>(str(order.discount));
  const [items, setItems] = useState<EditableItem[]>(
    (order.rental_order_items ?? []).map((i: any) => ({
      id: i.id,
      piece_name: i.piece_name ?? "",
      quantity: String(i.quantity ?? 1),
      width_cm: str(i.width_cm),
      depth_cm: str(i.depth_cm),
      height_cm: str(i.height_cm),
      unit_price: str(i.unit_price),
    })),
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const slot = slots.find((s) => s.id === slotId);
  const margin = slot?.firing_type === "glaze" ? Number(slot?.glaze_spacing_cm ?? 1) : 0;
  const totals = useMemo(
    () =>
      orderTotals(items, parseLocaleAmount(discount) || 0, toNumber(order.deposit_amount), margin),
    [items, discount, order.deposit_amount, margin],
  );
  const pay = reconcilePayments(payments, totals.total);

  const setItem = (idx: number, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const removeItem = (idx: number) => {
    const it = items[idx];
    if (
      paidExists &&
      !window.confirm(
        `Este pedido já tem pagamento registrado. Remover "${it.piece_name || "peça"}" vai mudar o total. Os pagamentos registrados serão mantidos. Remover mesmo assim?`,
      )
    )
      return;
    if (it.id) setRemovedIds((r) => [...r, it.id!]);
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const recalc = () => {
    const ppl = Number(slot?.price_per_liter ?? 0);
    if (!ppl) return toast.error("A vaga não tem preço por litro configurado.");
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        unit_price: String(suggestedUnitPrice(it, ppl, margin)).replace(".", ","),
      })),
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!customer.name.trim()) throw new Error("Informe o nome do cliente.");
      if (items.length === 0) throw new Error("O pedido precisa de pelo menos uma peça.");
      const num = (v: string | number) => parseLocaleAmount(String(v ?? "")) || 0;

      const { error: cErr } = await sb
        .from("rental_customers")
        .update({
          name: customer.name.trim(),
          studio_name: customer.studio_name.trim() || null,
          email: customer.email.trim(),
          phone: customer.phone.trim() || null,
        })
        .eq("id", order.customer_id)
        .eq("workspace_id", wsId);
      if (cErr) throw cErr;

      if (removedIds.length) {
        const { error } = await sb
          .from("rental_order_items")
          .delete()
          .in("id", removedIds)
          .eq("order_id", order.id);
        if (error) throw error;
      }
      for (const it of items) {
        const row = {
          piece_name: it.piece_name.trim() || "Peça",
          quantity: Math.max(Math.round(toNumber(it.quantity)) || 1, 1),
          width_cm: num(it.width_cm),
          depth_cm: num(it.depth_cm),
          height_cm: num(it.height_cm),
          volume_liters: itemVolume(
            {
              ...it,
              width_cm: num(it.width_cm),
              depth_cm: num(it.depth_cm),
              height_cm: num(it.height_cm),
            },
            margin,
          ),
          unit_price: num(it.unit_price),
          total_price: itemTotal({ ...it, unit_price: num(it.unit_price) }),
        };
        const q = it.id
          ? sb.from("rental_order_items").update(row).eq("id", it.id).eq("order_id", order.id)
          : sb
              .from("rental_order_items")
              .insert({ ...row, order_id: order.id, workspace_id: wsId });
        const { error } = await q;
        if (error) throw error;
      }

      for (const u of pay.updates) {
        const { error } = await sb
          .from("rental_payments")
          .update({ amount: u.amount })
          .eq("id", u.id)
          .eq("workspace_id", wsId)
          .neq("status", "paid");
        if (error) throw error;
      }

      const { error: oErr } = await sb
        .from("rental_orders")
        .update({
          slot_id: slotId,
          estimated_pickup_date: pickup || null,
          notes: notes.trim() || null,
          discount: parseLocaleAmount(discount) || 0,
          subtotal: totals.subtotal,
          total: totals.total,
          total_liters: totals.total_liters,
          balance_amount: totals.balance_amount,
        })
        .eq("id", order.id)
        .eq("workspace_id", wsId);
      if (oErr) throw oErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-orders", wsId] });
      qc.invalidateQueries({ queryKey: ["rental-slots", wsId] });
      toast.success("Pedido atualizado.");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar pedido {order.code}</DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Cliente</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["name", "Nome"],
                ["studio_name", "Ateliê"],
                ["email", "E-mail"],
                ["phone", "Telefone"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  value={customer[k]}
                  onChange={(e) => setCustomer((c) => ({ ...c, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Vaga e datas</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Vaga / queima</Label>
              <Select value={slotId} onValueChange={setSlotId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Retirada prevista</Label>
              <Input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Vazio = data da vaga{slot?.pickup_date ? ` (${slot.pickup_date})` : ""}.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Peças</h3>
            <Button type="button" size="sm" variant="outline" onClick={recalc}>
              <Calculator className="mr-2 h-4 w-4" />
              Recalcular preços pela vaga
            </Button>
          </div>
          {items.map((it, idx) => (
            <div key={it.id ?? `new-${idx}`} className="space-y-2 rounded-md border p-3">
              <div className="flex gap-2">
                <Input
                  aria-label="Nome da peça"
                  placeholder="Nome da peça"
                  value={it.piece_name}
                  onChange={(e) => setItem(idx, { piece_name: e.target.value })}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remover peça"
                  onClick={() => removeItem(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    ["quantity", "Qtd."],
                    ["width_cm", "Compr. (cm)"],
                    ["depth_cm", "Prof. (cm)"],
                    ["height_cm", "Altura (cm)"],
                    ["unit_price", "Valor unit. (R$)"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      inputMode="decimal"
                      placeholder={k.endsWith("_cm") ? "Não informado" : "0"}
                      value={String(it[k] ?? "")}
                      onChange={(e) => setItem(idx, { [k]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Volume: {itemVolume(it, margin).toLocaleString("pt-BR")} L · Total da peça:{" "}
                {formatCurrency(itemTotal(it), currency)}
              </p>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setItems((p) => [
                ...p,
                {
                  piece_name: "",
                  quantity: "1",
                  width_cm: "",
                  depth_cm: "",
                  height_cm: "",
                  unit_price: "",
                },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar peça
          </Button>
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Desconto (R$)</Label>
            <Input
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
            <p>Subtotal: {formatCurrency(totals.subtotal, currency)}</p>
            <p className="font-semibold">Total: {formatCurrency(totals.total, currency)}</p>
            <p>Já pago: {formatCurrency(pay.paid, currency)}</p>
            <p>A receber: {formatCurrency(pay.due, currency)}</p>
          </div>
        </section>

        <div className="space-y-1">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <p className="text-xs text-muted-foreground">
          Status, pagamentos registrados, datas de pagamento e comentários não são alterados aqui.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
