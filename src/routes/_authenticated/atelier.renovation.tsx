import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency, monthLabel, parseLocaleAmount } from "@/lib/format";
import { renovationSummary } from "@/lib/orna-logic";
import { Hammer, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/atelier/renovation")({ component: Page });
const sb = supabase as any;
const NOW = new Date();
const empty = () => ({
  expense_date: new Date().toISOString().slice(0, 10),
  title: "",
  category: "Materiais",
  supplier: "",
  area: "",
  budget_amount: "0",
  actual_amount: "0",
  due_date: "",
  payment_date: "",
  payment_status: "pending",
  status: "planned",
  payment_method: "",
  priority: "medium",
  responsible: "",
  notes: "",
});

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [mode, setMode] = useState("all");
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());

  const { data: rows = [] } = useQuery({
    queryKey: ["renovation", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("renovation_items")
        .select("*")
        .eq("workspace_id", wsId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => rows.filter((row: any) => {
    const date = new Date(`${row.expense_date ?? row.created_at?.slice(0, 10)}T12:00:00`);
    if (mode === "month" && (date.getMonth() + 1 !== month || date.getFullYear() !== year)) return false;
    if (mode === "year" && date.getFullYear() !== year) return false;
    if (statusFilter !== "all" && row.status !== statusFilter && row.payment_status !== statusFilter) return false;
    if (search) {
      const haystack = [row.title, row.category, row.supplier, row.area, row.responsible, row.notes].join(" ").toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [rows, mode, month, year, statusFilter, search]);
  const totals = useMemo(() => renovationSummary(filtered), [filtered]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe a descrição da despesa.");
      const budget = parseLocaleAmount(form.budget_amount);
      const actual = parseLocaleAmount(form.actual_amount);
      if (!Number.isFinite(budget) || !Number.isFinite(actual)) throw new Error("Valores inválidos.");
      const payload = {
        workspace_id: wsId,
        expense_date: form.expense_date,
        title: form.title.trim(),
        category: form.category.trim() || null,
        supplier: form.supplier.trim() || null,
        area: form.area.trim() || null,
        budget_amount: budget,
        actual_amount: actual,
        due_date: form.due_date || null,
        payment_date: form.payment_date || null,
        payment_status: form.payment_status,
        status: form.status,
        payment_method: form.payment_method.trim() || null,
        priority: form.priority,
        responsible: form.responsible.trim() || null,
        notes: form.notes.trim() || null,
      };
      const { error } = editId
        ? await sb.from("renovation_items").update(payload).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("renovation_items").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["renovation"] }); setOpen(false); setEditId(null); setForm(empty()); toast.success("Despesa da reforma salva"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb.from("renovation_items").delete().eq("id", id).eq("workspace_id", wsId); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["renovation"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(row: any) {
    setEditId(row.id);
    setForm({
      expense_date: row.expense_date ?? row.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      title: row.title,
      category: row.category ?? "",
      supplier: row.supplier ?? "",
      area: row.area ?? "",
      budget_amount: String(row.budget_amount),
      actual_amount: String(row.actual_amount),
      due_date: row.due_date ?? "",
      payment_date: row.payment_date ?? "",
      payment_status: row.payment_status,
      status: row.status,
      payment_method: row.payment_method ?? "",
      priority: row.priority ?? "medium",
      responsible: row.responsible ?? "",
      notes: row.notes ?? "",
    });
    setOpen(true);
  }

  return <PageContainer>
    <PageHeader title="Reforma do Ateliê" helpKey="atelier.renovation" description="Orçamento, gasto real, pagamentos e responsáveis" action={<Button onClick={() => { setEditId(null); setForm(empty()); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Nova despesa</Button>} />
    <Card className="mb-4"><CardContent className="flex flex-wrap gap-2 p-3">
      <Select value={mode} onValueChange={setMode}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo o projeto</SelectItem><SelectItem value="month">Mês</SelectItem><SelectItem value="year">Ano</SelectItem></SelectContent></Select>
      {mode === "month" && <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{monthLabel(index + 1)}</SelectItem>)}</SelectContent></Select>}
      {mode !== "all" && <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent></Select>}
      <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="planned">Planejado</SelectItem><SelectItem value="in_progress">Em andamento</SelectItem><SelectItem value="done">Concluído</SelectItem><SelectItem value="pending">Pagamento pendente</SelectItem><SelectItem value="paid">Pago</SelectItem></SelectContent></Select>
      <Input className="max-w-xs" placeholder="Buscar item, fornecedor ou ambiente" value={search} onChange={(event) => setSearch(event.target.value)} />
    </CardContent></Card>
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5"><Stat label="Itens" value={String(totals.count)} /><Stat label="Orçado" value={formatCurrency(totals.budgeted, currency, privacy)} /><Stat label="Realizado" value={formatCurrency(totals.actual, currency, privacy)} tone="expense" /><Stat label="Pago" value={formatCurrency(totals.paid, currency, privacy)} tone="income" /><Stat label="Comprometido pendente" value={formatCurrency(totals.pending, currency, privacy)} tone="expense" /></div>
    <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Orçado × realizado por categoria</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={totals.byCategory}><CartesianGrid strokeDasharray="3 3" opacity={0.25} /><XAxis dataKey="name" fontSize={11} interval={0} angle={-15} height={55} /><YAxis fontSize={11} /><Tooltip formatter={(value: number) => formatCurrency(Number(value), currency, privacy)} /><Bar dataKey="value" name="Comprometido" fill="var(--primary)" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Variação</CardTitle></CardHeader><CardContent><div className={`font-mono text-3xl ${totals.variance > 0 ? "text-expense" : "text-income"}`}>{formatCurrency(totals.variance, currency, privacy)}</div><p className="mt-2 text-sm text-muted-foreground">{totals.variance > 0 ? "Acima do orçamento" : "Abaixo ou dentro do orçamento"}</p></CardContent></Card>
    </div>
    {filtered.length === 0 ? <EmptyState icon={Hammer} title="Sem despesas de reforma" /> : <Card><CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Data</th><th className="p-3">Item</th><th className="p-3">Ambiente</th><th className="p-3">Fornecedor</th><th className="p-3">Prioridade</th><th className="p-3 text-right">Orçado</th><th className="p-3 text-right">Real</th><th className="p-3">Status</th><th className="p-3" /></tr></thead><tbody>{filtered.map((row: any) => <tr key={row.id} className="border-t"><td className="p-3 font-mono">{row.expense_date ?? "—"}</td><td className="p-3"><div className="font-medium">{row.title}</div><div className="text-xs text-muted-foreground">{row.category ?? "—"}</div></td><td className="p-3">{row.area ?? "—"}</td><td className="p-3">{row.supplier ?? "—"}</td><td className="p-3">{priorityLabel(row.priority)}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(row.budget_amount), currency, privacy)}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(row.actual_amount), currency, privacy)}</td><td className="p-3"><div>{statusLabel(row.status)}</div><div className="text-xs text-muted-foreground">{paymentLabel(row.payment_status)}</div></td><td className="p-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></CardContent></Card>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{editId ? "Editar despesa" : "Nova despesa da reforma"}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Descrição</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Fornecedor</Label><Input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Ambiente</Label><Input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Valor orçado</Label><Input inputMode="decimal" value={form.budget_amount} onChange={(event) => setForm({ ...form, budget_amount: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Valor realizado</Label><Input inputMode="decimal" value={form.actual_amount} onChange={(event) => setForm({ ...form, actual_amount: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planned">Planejado</SelectItem><SelectItem value="in_progress">Em andamento</SelectItem><SelectItem value="done">Concluído</SelectItem><SelectItem value="cancelled">Cancelado</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Pagamento</Label><Select value={form.payment_status} onValueChange={(value) => setForm({ ...form, payment_status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="partial">Parcial</SelectItem><SelectItem value="paid">Pago</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Forma de pagamento</Label><Input value={form.payment_method} onChange={(event) => setForm({ ...form, payment_method: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Prioridade</Label><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></div>
      <div className="space-y-1.5"><Label>Pago em</Label><Input type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Responsável</Label><Input value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })} /></div>
      <div className="col-span-2 space-y-1.5"><Label>Observações</Label><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button></DialogFooter></DialogContent></Dialog>
  </PageContainer>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) { return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-xl ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div></CardContent></Card>; }
function statusLabel(value: string) { return ({ planned: "Planejado", in_progress: "Em andamento", done: "Concluído", cancelled: "Cancelado" } as Record<string, string>)[value] ?? value; }
function paymentLabel(value: string) { return ({ pending: "Pendente", partial: "Parcial", paid: "Pago" } as Record<string, string>)[value] ?? value; }
function priorityLabel(value: string) { return ({ low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" } as Record<string, string>)[value] ?? value ?? "—"; }
