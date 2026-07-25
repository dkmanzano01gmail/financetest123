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
import { Plus, Trash2, Wallet, Pencil } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/atelier/cash-flow")({ component: CashFlowPage });

const sb = supabase as any;
const emptyForm = { entry_date: new Date().toISOString().slice(0, 10), type: "income", description: "", amount: "", recurrence: "none", status: "projected", notes: "" };

function CashFlowPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [balOpen, setBalOpen] = useState(false);
  const [balForm, setBalForm] = useState({ starting_balance: "0", starting_balance_date: new Date().toISOString().slice(0, 10) });

  const { data: entries } = useQuery({
    queryKey: ["cash_flow_entries", wsId], enabled: !!wsId,
    queryFn: async () => (await sb.from("cash_flow_entries").select("*").eq("workspace_id", wsId).order("entry_date", { ascending: true })).data ?? [],
  });
  const { data: settings } = useQuery({
    queryKey: ["cash_flow_settings", wsId], enabled: !!wsId,
    queryFn: async () => (await sb.from("cash_flow_settings").select("*").eq("workspace_id", wsId).maybeSingle()).data,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        workspace_id: wsId, entry_date: form.entry_date, type: form.type, description: form.description,
        amount: Number(form.amount.replace(",", ".") || 0), recurrence: form.recurrence, status: form.status, notes: form.notes || null,
      };
      const { error } = editId
        ? await sb.from("cash_flow_entries").update(payload).eq("id", editId)
        : await sb.from("cash_flow_entries").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cash_flow_entries"] }); setOpen(false); setEditId(null); setForm(emptyForm); toast.success("Salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb.from("cash_flow_entries").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash_flow_entries"] }),
  });

  const balMut = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("cash_flow_settings").upsert({
        workspace_id: wsId,
        starting_balance: Number(balForm.starting_balance.replace(",", ".") || 0),
        starting_balance_date: balForm.starting_balance_date,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cash_flow_settings"] }); setBalOpen(false); toast.success("Saldo inicial atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const chart = useMemo(() => {
    let bal = Number(settings?.starting_balance ?? 0);
    return (entries ?? []).map((e: any) => {
      const delta = (e.type === "income" ? 1 : -1) * Number(e.amount);
      bal += delta;
      return { date: e.entry_date, balance: Number(bal.toFixed(2)) };
    });
  }, [entries, settings]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const e of entries ?? []) {
      if (e.type === "income") inc += Number(e.amount);
      else exp += Number(e.amount);
    }
    return { inc, exp, net: inc - exp };
  }, [entries]);

  function openEdit(e: any) {
    setEditId(e.id);
    setForm({ entry_date: e.entry_date, type: e.type, description: e.description, amount: String(e.amount), recurrence: e.recurrence, status: e.status, notes: e.notes ?? "" });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader title="Fluxo de Caixa" description="Lançamentos reais e projetados com saldo acumulado"
        action={<div className="flex gap-2"><Button variant="outline" onClick={() => { setBalForm({ starting_balance: String(settings?.starting_balance ?? "0"), starting_balance_date: settings?.starting_balance_date ?? new Date().toISOString().slice(0, 10) }); setBalOpen(true); }}>Saldo inicial</Button><Button onClick={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />Lançamento</Button></div>} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Saldo inicial" value={formatCurrency(Number(settings?.starting_balance ?? 0), currency, privacy)} sub={settings?.starting_balance_date ?? "—"} />
        <StatCard label="Entradas" value={formatCurrency(totals.inc, currency, privacy)} tone="income" />
        <StatCard label="Saídas" value={formatCurrency(totals.exp, currency, privacy)} tone="expense" />
        <StatCard label="Saldo projetado" value={formatCurrency(Number(settings?.starting_balance ?? 0) + totals.net, currency, privacy)} />
      </div>

      <Card className="mb-4"><CardContent className="p-4 h-64">
        {chart.length === 0 ? <div className="text-sm text-muted-foreground text-center pt-20">Sem lançamentos</div> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v: any) => formatCurrency(Number(v), currency, privacy)} /><Line type="monotone" dataKey="balance" stroke="var(--color-primary)" strokeWidth={2} /></LineChart>
          </ResponsiveContainer>
        )}
      </CardContent></Card>

      {(entries?.length ?? 0) === 0 ? (
        <EmptyState icon={Wallet} title="Sem lançamentos" action={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Novo lançamento</Button>} />
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Tipo</th><th className="p-3">Recorrência</th><th className="p-3">Status</th><th className="p-3 text-right">Valor</th><th className="p-3"></th></tr></thead>
            <tbody>{entries!.map((e: any) => (
              <tr key={e.id} className="border-t border-border">
                <td className="p-3 font-mono">{e.entry_date}</td>
                <td className="p-3">{e.description}</td>
                <td className="p-3">{e.type === "income" ? "Entrada" : "Saída"}</td>
                <td className="p-3 text-xs">{e.recurrence}</td>
                <td className="p-3 text-xs">{e.status}</td>
                <td className={`p-3 text-right font-mono ${e.type === "income" ? "text-income" : "text-expense"}`}>{formatCurrency(Number(e.amount), currency, privacy)}</td>
                <td className="p-3 flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => delMut.mutate(e.id)}><Trash2 className="w-4 h-4" /></Button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar lançamento" : "Novo lançamento"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="income">Entrada</SelectItem><SelectItem value="expense">Saída</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Valor</Label><Input placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Recorrência</Label>
              <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Única</SelectItem><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="yearly">Anual</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="projected">Projetado</SelectItem><SelectItem value="realized">Realizado</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.description}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={balOpen} onOpenChange={setBalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Saldo inicial</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Data de referência</Label><Input type="date" value={balForm.starting_balance_date} onChange={(e) => setBalForm({ ...balForm, starting_balance_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Saldo</Label><Input value={balForm.starting_balance} onChange={(e) => setBalForm({ ...balForm, starting_balance: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBalOpen(false)}>Cancelar</Button><Button onClick={() => balMut.mutate()} disabled={balMut.isPending}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "income" | "expense" }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-2xl mt-1 ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );
}