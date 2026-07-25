import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, Pencil, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/class-materials")({ component: Page });
const sb = supabase as any;
const empty = { usage_date: new Date().toISOString().slice(0,10), student_name: "", material: "", grams: "0", amount_charged: "0", payment_status: "pending", payment_date: "", comments: "" };

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(empty);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data: rows } = useQuery({
    queryKey: ["class_materials_usage", wsId], enabled: !!wsId,
    queryFn: async () => (await sb.from("class_materials_usage").select("*").eq("workspace_id", wsId).order("usage_date", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => (rows ?? []).filter((r: any) =>
    (status === "all" || r.payment_status === status) &&
    (!q || r.student_name.toLowerCase().includes(q.toLowerCase()) || r.material.toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, status]);

  const totals = useMemo(() => {
    let total = 0, paid = 0, pending = 0;
    for (const r of filtered) { total += Number(r.amount_charged); if (r.payment_status === "paid") paid += Number(r.amount_charged); else if (r.payment_status === "pending") pending += Number(r.amount_charged); }
    return { total, paid, pending };
  }, [filtered]);

  const save = useMutation({
    mutationFn: async () => {
      const p: any = { workspace_id: wsId, usage_date: f.usage_date, student_name: f.student_name, material: f.material, grams: Number(f.grams.replace(",", ".") || 0), amount_charged: Number(f.amount_charged.replace(",", ".") || 0), payment_status: f.payment_status, payment_date: f.payment_date || null, comments: f.comments || null };
      const { error } = editId ? await sb.from("class_materials_usage").update(p).eq("id", editId).eq("workspace_id", wsId) : await sb.from("class_materials_usage").insert(p);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["class_materials_usage"] }); setOpen(false); setEditId(null); setF(empty); toast.success("Salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: async (id: string) => { const { error } = await sb.from("class_materials_usage").delete().eq("id", id).eq("workspace_id", wsId); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: ["class_materials_usage"] }) });
  function edit(r: any) { setEditId(r.id); setF({ usage_date: r.usage_date, student_name: r.student_name, material: r.material, grams: String(r.grams), amount_charged: String(r.amount_charged), payment_status: r.payment_status, payment_date: r.payment_date ?? "", comments: r.comments ?? "" }); setOpen(true); }

  return (
    <PageContainer>
      <PageHeader title="Material Aulas Regulares" description="Uso de material por aluno e pagamento" action={<Button onClick={() => { setEditId(null); setF(empty); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />Novo</Button>} />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Total</div><div className="font-mono text-xl">{formatCurrency(totals.total, currency, privacy)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">Pago</div><div className="font-mono text-xl text-income">{formatCurrency(totals.paid, currency, privacy)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground uppercase">A receber</div><div className="font-mono text-xl text-expense">{formatCurrency(totals.pending, currency, privacy)}</div></CardContent></Card>
      </div>

      <div className="flex gap-2 mb-3">
        <Input placeholder="Buscar aluno/material" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="waived">Cortesia</SelectItem></SelectContent></Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Sem registros" />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Data</th><th className="p-3">Aluno</th><th className="p-3">Material</th><th className="p-3 text-right">Gramas</th><th className="p-3 text-right">Valor</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>{filtered.map((r: any) => (
            <tr key={r.id} className="border-t border-border">
              <td className="p-3 font-mono">{r.usage_date}</td><td className="p-3">{r.student_name}</td><td className="p-3">{r.material}</td>
              <td className="p-3 text-right font-mono">{r.grams}g</td>
              <td className="p-3 text-right font-mono">{formatCurrency(Number(r.amount_charged), currency, privacy)}</td>
              <td className="p-3 text-xs">{r.payment_status}</td>
              <td className="p-3 flex gap-1 justify-end"><Button variant="ghost" size="icon" onClick={() => edit(r)}><Pencil className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}><Trash2 className="w-4 h-4" /></Button></td>
            </tr>
          ))}</tbody>
        </table></CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar" : "Novo registro"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={f.usage_date} onChange={(e) => setF({ ...f, usage_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Aluno</Label><Input value={f.student_name} onChange={(e) => setF({ ...f, student_name: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Material</Label><Input value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Gramas</Label><Input value={f.grams} onChange={(e) => setF({ ...f, grams: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Valor cobrado</Label><Input value={f.amount_charged} onChange={(e) => setF({ ...f, amount_charged: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Status</Label><Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="waived">Cortesia</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Data pagamento</Label><Input type="date" value={f.payment_date} onChange={(e) => setF({ ...f, payment_date: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Comentários</Label><Input value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !f.student_name}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}