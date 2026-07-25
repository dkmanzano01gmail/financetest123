import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { useCustomizations } from "@/hooks/use-customizations";
import { useCustomizedUI } from "@/hooks/use-customized-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, monthLabel } from "@/lib/format";
import { L } from "@/lib/labels";
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp, CreditCard, Receipt } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, PieChart, Pie } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const NOW = new Date();

function Dashboard() {
  const { workspace } = useCurrentWorkspace();
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());

  const wsId = workspace?.id;
  const privacy = workspace?.privacy_mode ?? false;
  const currency = workspace?.currency ?? "BRL";
  const { labelOverrides, hiddenCards } = useCustomizations(wsId);
  const { cardOrder, hiddenCards: hiddenCards2 } = useCustomizedUI(wsId);
  const t = L(workspace?.type ?? "personal", labelOverrides);

  const { data: txs } = useQuery({
    queryKey: ["transactions", wsId, year, month],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, categories!transactions_category_id_fkey(name, color)")
        .eq("workspace_id", wsId!)
        .eq("year", year)
        .eq("month", month);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: yearTxs } = useQuery({
    queryKey: ["transactions-year", wsId, year],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("type, amount, month")
        .eq("workspace_id", wsId!)
        .eq("year", year);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("*").eq("workspace_id", wsId!).eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const income = (txs ?? []).filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expense = (txs ?? []).filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
    return { income, expense, net: income - expense };
  }, [txs]);

  const accountsBalance = useMemo(() => {
    if (!accounts) return 0;
    return accounts.reduce((s: number, a: any) => s + Number(a.current_manual_balance ?? a.initial_balance ?? 0), 0);
  }, [accounts]);

  const monthlySeries = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({ month: monthLabel(i + 1), income: 0, expense: 0 }));
    for (const t of yearTxs ?? []) {
      const idx = (t as any).month - 1;
      if ((t as any).type === "income") arr[idx].income += Number((t as any).amount);
      else arr[idx].expense += Number((t as any).amount);
    }
    return arr;
  }, [yearTxs]);

  const { expenseByCategory, incomeByCategory } = useMemo(() => {
    const build = (type: "income" | "expense") => {
      const m = new Map<string, { name: string; color: string; value: number }>();
      for (const tx of txs ?? []) {
        if ((tx as any).type !== type) continue;
        const cat = (tx as any).categories;
        const name = cat?.name ?? "Sem categoria";
        const color = cat?.color ?? (type === "income" ? "#6E7A57" : "#A03A2A");
        const v = Number((tx as any).amount);
        const prev = m.get(name);
        if (prev) prev.value += v;
        else m.set(name, { name, color, value: v });
      }
      return Array.from(m.values()).sort((a, b) => b.value - a.value);
    };
    return { expenseByCategory: build("expense"), incomeByCategory: build("income") };
  }, [txs]);
  const byCategory = expenseByCategory;

  const topCategory = byCategory[0];

  if (!workspace) return <PageContainer><div className="text-muted-foreground">Carregando...</div></PageContainer>;

  const hasData = (txs?.length ?? 0) > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Visão financeira de ${workspace.name}`}
        action={
          <div className="flex gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, i) => (
                  <SelectItem key={i+1} value={String(i+1)}>{monthLabel(i+1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year-1, year, year+1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(() => {
          const hide = new Set<string>([...hiddenCards, ...hiddenCards2]);
          const cards: Array<{ key: string; node: ReactNode }> = [
            { key: "income", node: <StatCard label={`${t.income} do mês`} value={formatCurrency(totals.income, currency, privacy)} icon={ArrowUpRight} tone="income" /> },
            { key: "expense", node: <StatCard label={`${t.expense} do mês`} value={formatCurrency(totals.expense, currency, privacy)} icon={ArrowDownRight} tone="expense" /> },
            { key: "balance", node: <StatCard label={t.balance} value={formatCurrency(totals.net, currency, privacy)} icon={TrendingUp} tone={totals.net >= 0 ? "income" : "expense"} /> },
            { key: "accounts_balance", node: <StatCard label="Saldo em contas" value={formatCurrency(accountsBalance, currency, privacy)} icon={Wallet} /> },
          ].filter((c) => !hide.has(c.key));
          if (cardOrder.length) {
            const m = new Map(cards.map((c) => [c.key, c]));
            const ordered: typeof cards = [];
            for (const k of cardOrder) { const it = m.get(k); if (it) { ordered.push(it); m.delete(k); } }
            for (const c of cards) if (m.has(c.key)) ordered.push(c);
            return ordered.map((c) => <div key={c.key}>{c.node}</div>);
          }
          return cards.map((c) => <div key={c.key}>{c.node}</div>);
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Entradas vs Saídas em {year}</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => privacy ? "•" : Intl.NumberFormat("pt-BR", { notation: "compact" }).format(v)} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v, currency, privacy)}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}
                />
                <Bar dataKey="income" name={t.income} fill="var(--income)" radius={[6,6,0,0]} />
                <Bar dataKey="expense" name={t.expense} fill="var(--expense)" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t.expense} por categoria</CardTitle></CardHeader>
          <CardContent className="h-72">
            <CategoryPie data={expenseByCategory} currency={currency} privacy={privacy} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">{t.income} por categoria</CardTitle></CardHeader>
          <CardContent className="h-64"><CategoryPie data={incomeByCategory} currency={currency} privacy={privacy} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Maior categoria de {t.expense.toLowerCase()}</CardTitle></CardHeader>
          <CardContent>
            {topCategory ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full" style={{ background: topCategory.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{topCategory.name}</div>
                  <div className="text-xs text-muted-foreground">{((topCategory.value/totals.expense)*100 || 0).toFixed(1)}% do total</div>
                </div>
                <div className="font-mono text-xl">{formatCurrency(topCategory.value, currency, privacy)}</div>
              </div>
            ) : <div className="text-sm text-muted-foreground">Sem dados.</div>}
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="w-4 h-4" />Últimas transações</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(txs ?? []).slice(0,8).map((tx: any) => (
              <div key={tx.id} className="flex items-center gap-3 py-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>
                  {tx.type === "income" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{tx.description}</div>
                  <div className="text-xs text-muted-foreground">{tx.categories?.name ?? "—"}</div>
                </div>
                <div className={`font-mono ${tx.type === "income" ? "text-income" : "text-expense"}`}>
                  {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount), currency, privacy)}
                </div>
              </div>
            ))}
            {!hasData && <EmptyState icon={Receipt} title="Sem transações neste período" description="Crie uma transação para começar." />}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone?: "income" | "expense" }) {
  const toneClass = tone === "income" ? "text-income bg-income/10" : tone === "expense" ? "text-expense bg-expense/10" : "text-primary bg-primary/10";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="font-mono text-xl md:text-2xl mt-1">{value}</div>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryPie({ data, currency, privacy }: { data: Array<{ name: string; color: string; value: number }>; currency: string; privacy: boolean }) {
  if (data.length === 0) return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados no período.</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75} paddingAngle={2}>
          {data.map((c, i) => <Cell key={i} fill={c.color} />)}
        </Pie>
        <Tooltip formatter={(v: number) => formatCurrency(v, currency, privacy)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
