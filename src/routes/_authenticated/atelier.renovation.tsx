import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, Pencil, Hammer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/renovation")({ component: Page });
const sb = supabase as any;
const empty = {
  title: "",
  category: "",
  supplier: "",
  budget_amount: "0",
  actual_amount: "0",
  due_date: "",
  payment_date: "",
  payment_status: "pending",
  status: "planned",
  notes: "",
};

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(empty);

  const { data: rows } = useQuery({
    queryKey: ["renovation", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await sb
          .from("renovation_items")
          .select("*")
          .eq("workspace_id", wsId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });
  const totals = useMemo(() => {
    let budget = 0,
      actual = 0;
    for (const r of rows ?? []) {
      budget += Number(r.budget_amount);
      actual += Number(r.actual_amount);
    }
    return { budget, actual, remaining: budget - actual };
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      const p: any = {
        workspace_id: wsId,
        title: f.title,
        category: f.category || null,
        supplier: f.supplier || null,
        budget_amount: Number(f.budget_amount.replace(",", ".") || 0),
        actual_amount: Number(f.actual_amount.replace(",", ".") || 0),
        due_date: f.due_date || null,
        payment_date: f.payment_date || null,
        payment_status: f.payment_status,
        status: f.status,
        notes: f.notes || null,
      };
      const { error } = editId
        ? await sb.from("renovation_items").update(p).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("renovation_items").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["renovation"] });
      setOpen(false);
      setEditId(null);
      setF(empty);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("renovation_items")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["renovation"] }),
  });
  function edit(r: any) {
    setEditId(r.id);
    setF({
      title: r.title,
      category: r.category ?? "",
      supplier: r.supplier ?? "",
      budget_amount: String(r.budget_amount),
      actual_amount: String(r.actual_amount),
      due_date: r.due_date ?? "",
      payment_date: r.payment_date ?? "",
      payment_status: r.payment_status,
      status: r.status,
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reforma do Ateliê"
        description="Orçamento planejado vs gasto real"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setF(empty);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Novo item
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Orçado</div>
            <div className="font-mono text-xl">
              {formatCurrency(totals.budget, currency, privacy)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Gasto real</div>
            <div className="font-mono text-xl text-expense">
              {formatCurrency(totals.actual, currency, privacy)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Restante</div>
            <div
              className={`font-mono text-xl ${totals.remaining < 0 ? "text-destructive" : "text-income"}`}
            >
              {formatCurrency(totals.remaining, currency, privacy)}
            </div>
          </CardContent>
        </Card>
      </div>

      {(rows?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Hammer}
          title="Sem itens de reforma"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Novo item
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Item</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Fornecedor</th>
                  <th className="p-3 text-right">Orçado</th>
                  <th className="p-3 text-right">Real</th>
                  <th className="p-3">Prazo</th>
                  <th className="p-3">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows!.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3">{r.title}</td>
                    <td className="p-3 text-xs">{r.category ?? "—"}</td>
                    <td className="p-3 text-xs">{r.supplier ?? "—"}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(Number(r.budget_amount), currency, privacy)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(Number(r.actual_amount), currency, privacy)}
                    </td>
                    <td className="p-3 text-xs font-mono">{r.due_date ?? "—"}</td>
                    <td className="p-3 text-xs">
                      {r.status} / {r.payment_status}
                    </td>
                    <td className="p-3 flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => edit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Item</Label>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                value={f.category}
                onChange={(e) => setF({ ...f, category: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Input
                value={f.supplier}
                onChange={(e) => setF({ ...f, supplier: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Orçado</Label>
              <Input
                value={f.budget_amount}
                onChange={(e) => setF({ ...f, budget_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gasto real</Label>
              <Input
                value={f.actual_amount}
                onChange={(e) => setF({ ...f, actual_amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input
                type="date"
                value={f.due_date}
                onChange={(e) => setF({ ...f, due_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data pagamento</Label>
              <Input
                type="date"
                value={f.payment_date}
                onChange={(e) => setF({ ...f, payment_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planejado</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pagamento</Label>
              <Select
                value={f.payment_status}
                onValueChange={(v) => setF({ ...f, payment_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !f.title}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
