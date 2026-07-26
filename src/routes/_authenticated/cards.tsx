import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
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
import { CreditCard, Pencil, Plus, Power, Receipt } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cards")({ component: CardsPage });
const NOW = new Date();
const empty = () => ({ name: "", institution: "", brand: "", limit_amount: "", closing_day: "1", due_day: "10" });

function CardsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());

  const { data: cards = [] } = useQuery({
    queryKey: ["cards-full", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_cards").select("*").eq("workspace_id", wsId!).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ["card-expenses", wsId, month, year],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,date,description,amount,type,credit_card_id,account_id,categories(name,color)")
        .eq("workspace_id", wsId!)
        .eq("month", month)
        .eq("year", year)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const analytics = useMemo(() => {
    const byCard = new Map<string, { spend: number; transactions: any[]; categories: Map<string, number> }>();
    let invoicePayments = 0;
    for (const tx of transactions as any[]) {
      const category = String(tx.categories?.name ?? "");
      if (!tx.credit_card_id && tx.type === "expense" && category.toLowerCase().includes("cartão de crédito")) invoicePayments += Number(tx.amount || 0);
      if (!tx.credit_card_id) continue;
      const item = byCard.get(tx.credit_card_id) ?? { spend: 0, transactions: [], categories: new Map<string, number>() };
      const value = Math.abs(Number(tx.amount || 0));
      const signedValue = tx.type === "income" ? -value : value;
      item.spend += signedValue;
      item.transactions.push(tx);
      const cat = tx.categories?.name ?? "Sem categoria";
      item.categories.set(cat, (item.categories.get(cat) || 0) + signedValue);
      byCard.set(tx.credit_card_id, item);
    }
    const totalSpend = [...byCard.values()].reduce((sum, item) => sum + item.spend, 0);
    return { byCard, totalSpend, invoicePayments };
  }, [transactions]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do cartão.");
      const limit = form.limit_amount.trim() ? parseLocaleAmount(form.limit_amount) : 0;
      const closingDay = Number(form.closing_day);
      const dueDay = Number(form.due_day);
      if (!Number.isFinite(limit)) throw new Error("Limite inválido.");
      if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) throw new Error("Dia de fechamento inválido.");
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error("Dia de vencimento inválido.");
      const payload = { workspace_id: wsId!, name: form.name.trim(), institution: form.institution.trim() || null, brand: form.brand.trim() || null, limit_amount: limit, closing_day: closingDay, due_day: dueDay };
      const { error } = editId
        ? await supabase.from("credit_cards").update(payload).eq("id", editId).eq("workspace_id", wsId!)
        : await supabase.from("credit_cards").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards-full"] }); qc.invalidateQueries({ queryKey: ["cards"] }); setOpen(false); setEditId(null); setForm(empty()); toast.success("Cartão salvo"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => { const { error } = await supabase.from("credit_cards").update({ is_active }).eq("id", id).eq("workspace_id", wsId!); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards-full"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(card: any) {
    setEditId(card.id);
    setForm({ name: card.name, institution: card.institution ?? "", brand: card.brand ?? "", limit_amount: String(card.limit_amount ?? 0), closing_day: String(card.closing_day ?? 1), due_day: String(card.due_day ?? 10) });
    setOpen(true);
  }

  return <PageContainer>
    <PageHeader title="Cartões" description="Faturas, gastos detalhados e pagamentos" action={<Button onClick={() => { setEditId(null); setForm(empty()); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Novo cartão</Button>} />
    <Card className="mb-4"><CardContent className="flex flex-wrap gap-2 p-3"><Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{monthLabel(index + 1)}</SelectItem>)}</SelectContent></Select><Select value={String(year)} onValueChange={(value) => setYear(Number(value))}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent></Select></CardContent></Card>
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Gastos no cartão" value={formatCurrency(analytics.totalSpend, currency, privacy)} tone="expense" /><Stat label="Pagamentos de fatura" value={formatCurrency(analytics.invoicePayments, currency, privacy)} /><Stat label="Diferença" value={formatCurrency(analytics.totalSpend - analytics.invoicePayments, currency, privacy)} tone={analytics.totalSpend - analytics.invoicePayments > 0 ? "expense" : undefined} /><Stat label="Compras detalhadas" value={String((transactions as any[]).filter((tx) => tx.credit_card_id).length)} /></div>
    {cards.length === 0 ? <EmptyState icon={CreditCard} title="Nenhum cartão cadastrado" /> : <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{cards.map((card: any) => {
      const data = analytics.byCard.get(card.id) ?? { spend: 0, transactions: [], categories: new Map<string, number>() };
      const available = Number(card.limit_amount || 0) - data.spend;
      const topCategory = [...data.categories].sort((a, b) => b[1] - a[1])[0];
      return <Card key={card.id} className={card.is_active ? "" : "opacity-60"}><CardHeader><div className="flex items-start justify-between"><div><CardTitle className="text-base">{card.name}</CardTitle><div className="text-xs text-muted-foreground">{card.institution ?? "—"} {card.brand ? `· ${card.brand}` : ""}</div></div><div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => edit(card)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => toggle.mutate({ id: card.id, is_active: !card.is_active })}><Power className="h-4 w-4" /></Button></div></div></CardHeader><CardContent><div className="grid grid-cols-2 gap-3"><Info label="Gasto do mês" value={formatCurrency(data.spend, currency, privacy)} tone="expense" /><Info label="Limite disponível" value={formatCurrency(available, currency, privacy)} tone={available < 0 ? "expense" : "income"} /><Info label="Limite" value={formatCurrency(Number(card.limit_amount), currency, privacy)} /><Info label="Maior categoria" value={topCategory ? `${topCategory[0]} · ${formatCurrency(topCategory[1], currency, privacy)}` : "—"} /></div><div className="mt-3 text-xs text-muted-foreground">Fecha dia {card.closing_day} · vence dia {card.due_day}</div><div className="mt-4 space-y-2">{data.transactions.slice(0, 5).map((tx: any) => <div key={tx.id} className="flex items-center gap-2 border-t pt-2 text-sm"><Receipt className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="truncate">{tx.description}</div><div className="text-xs text-muted-foreground">{tx.date} · {tx.categories?.name ?? "Sem categoria"}</div></div><div className={`font-mono ${tx.type === "income" ? "text-income" : "text-expense"}`}>{tx.type === "income" ? "+" : "-"}{formatCurrency(Math.abs(Number(tx.amount)), currency, privacy)}</div></div>)}{!data.transactions.length && <div className="text-sm text-muted-foreground">Sem compras detalhadas no período.</div>}</div></CardContent></Card>;
    })}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{editId ? "Editar cartão" : "Novo cartão"}</DialogTitle></DialogHeader><div className="space-y-3"><Field label="Nome"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Instituição"><Input value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} /></Field><Field label="Bandeira"><Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field></div><Field label="Limite"><Input inputMode="decimal" value={form.limit_amount} onChange={(event) => setForm({ ...form, limit_amount: event.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Fechamento"><Input type="number" min={1} max={31} value={form.closing_day} onChange={(event) => setForm({ ...form, closing_day: event.target.value })} /></Field><Field label="Vencimento"><Input type="number" min={1} max={31} value={form.due_day} onChange={(event) => setForm({ ...form, due_day: event.target.value })} /></Field></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button></DialogFooter></DialogContent></Dialog>
  </PageContainer>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "expense" }) { return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-xl ${tone === "expense" ? "text-expense" : ""}`}>{value}</div></CardContent></Card>; }
function Info({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`font-mono ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
