import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { useCustomizations } from "@/hooks/use-customizations";
import { useCustomizedUI } from "@/hooks/use-customized-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, monthLabel } from "@/lib/format";
import { L } from "@/lib/labels";
import { dashboardSummary } from "@/lib/orna-logic";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  Wallet,
  TrendingUp,
  Receipt,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const NOW = new Date();

function Dashboard() {
  const navigate = Route.useNavigate();
  const { workspace } = useCurrentWorkspace();
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());

  const wsId = workspace?.id;
  const privacy = workspace?.privacy_mode ?? false;
  const currency = workspace?.currency ?? "BRL";
  const { labelOverrides, hiddenCards } = useCustomizations(wsId);
  const { cardOrder, hiddenCards: hiddenCards2 } = useCustomizedUI(wsId);
  const t = L(workspace?.type ?? "personal", labelOverrides);

  const { data: yearTxs } = useQuery({
    queryKey: ["transactions-dashboard-period", wsId, year],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,date,type,amount,description,counterparty,status,category_id,categories!transactions_category_id_fkey(name,color)")
        .eq("workspace_id", wsId!)
        .in("year", [year, year - 1]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accounts", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("workspace_id", wsId!)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(
    () => dashboardSummary((yearTxs ?? []) as any, month, year),
    [yearTxs, month, year],
  );
  const totals = {
    income: summary.income,
    expense: summary.expense,
    net: summary.balance,
  };

  const accountsBalance = useMemo(() => {
    if (!accounts) return 0;
    return accounts.reduce(
      (sum: number, account: any) =>
        sum + Number(account.current_manual_balance ?? account.initial_balance ?? 0),
      0,
    );
  }, [accounts]);

  const expenseByCategory = summary.expenseCategories;
  const incomeByCategory = summary.incomeCategories;

  function openCategory(type: "income" | "expense", category: string) {
    navigate({
      to: "/transactions",
      search: {
        month: String(month),
        year: String(year),
        type,
        category,
      },
    });
  }

  if (!workspace)
    return (
      <PageContainer>
        <div className="text-muted-foreground">Carregando...</div>
      </PageContainer>
    );

  const hasData = summary.count > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`Visão financeira de ${workspace.name}`}
        action={
          <div className="flex gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {monthLabel(i + 1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[year - 1, year, year + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(() => {
          const hide = new Set<string>([...hiddenCards, ...hiddenCards2]);
          const cards: Array<{ key: string; node: ReactNode }> = [
            {
              key: "income",
              node: (
                <StatCard
                  label={`${t.income} do mês`}
                  value={formatCurrency(totals.income, currency, privacy)}
                  icon={ArrowUpRight}
                  tone="income"
                />
              ),
            },
            {
              key: "expense",
              node: (
                <StatCard
                  label={`${t.expense} do mês`}
                  value={formatCurrency(totals.expense, currency, privacy)}
                  icon={ArrowDownRight}
                  tone="expense"
                />
              ),
            },
            {
              key: "balance",
              node: (
                <StatCard
                  label={t.balance}
                  value={formatCurrency(totals.net, currency, privacy)}
                  icon={TrendingUp}
                  tone={totals.net >= 0 ? "income" : "expense"}
                />
              ),
            },
            {
              key: "accounts_balance",
              node: (
                <StatCard
                  label="Saldo em contas"
                  value={formatCurrency(accountsBalance, currency, privacy)}
                  icon={Wallet}
                />
              ),
            },
          ].filter((c) => !hide.has(c.key));
          if (cardOrder.length) {
            const m = new Map(cards.map((c) => [c.key, c]));
            const ordered: typeof cards = [];
            for (const k of cardOrder) {
              const it = m.get(k);
              if (it) {
                ordered.push(it);
                m.delete(k);
              }
            }
            for (const c of cards) if (m.has(c.key)) ordered.push(c);
            return ordered.map((c) => <div key={c.key}>{c.node}</div>);
          }
          return cards.map((c) => <div key={c.key}>{c.node}</div>);
        })()}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Margem líquida"
          value={`${(summary.metrics.netMargin * 100).toFixed(1)}%`}
          sub={`${formatCurrency(summary.metrics.balanceDelta, currency, privacy)} vs mês anterior`}
          positive={summary.metrics.netMargin >= 0}
        />
        <MetricCard
          label="Despesas / receitas"
          value={summary.metrics.expenseRatio == null ? "—" : `${(summary.metrics.expenseRatio * 100).toFixed(1)}%`}
          sub={`${formatCurrency(summary.metrics.expenseDelta, currency, privacy)} de variação`}
          positive={summary.metrics.expenseDelta <= 0}
        />
        <MetricCard
          label="Ticket médio"
          value={formatCurrency(summary.metrics.averageTransaction, currency, privacy)}
          sub={`${summary.count} transações no mês`}
        />
        <MetricCard
          label="Saldo médio mensal"
          value={formatCurrency(summary.metrics.averageMonthlyBalance, currency, privacy)}
          sub={`${summary.monthly.filter((item) => item.income || item.expense).length} meses ativos em ${year}`}
          positive={summary.metrics.averageMonthlyBalance >= 0}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <AudienceCard
          icon={Users}
          label="Alunos pagantes — aulas regulares"
          value={summary.audience.regularPayingStudents}
          sub={`${summary.audience.regularPayments} recebimento(s) · ${formatCurrency(summary.audience.regularRevenue, currency, privacy)}`}
          onClick={() => openCategory("income", "Aulas regulares")}
        />
        <AudienceCard
          icon={CalendarCheck}
          label="Participantes de workshops no mês"
          value={summary.audience.workshopParticipants}
          sub={`${summary.audience.workshopPayments} recebimento(s) · estimativa por R$ 290 com até 10% de desconto`}
          onClick={() => openCategory("income", "Workshops")}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryComparison
          title={`${t.income} por categoria`}
          description="Valor do mês comparado com a média dos meses anteriores."
          tone="income"
          data={summary.incomeBenchmarks}
          colors={incomeByCategory}
          currency={currency}
          privacy={privacy}
          onSelect={(category) => openCategory("income", category)}
        />
        <CategoryComparison
          title={`${t.expense} por categoria`}
          description="Valor do mês comparado com a média dos meses anteriores."
          tone="expense"
          data={summary.expenseBenchmarks}
          colors={expenseByCategory}
          currency={currency}
          privacy={privacy}
          onSelect={(category) => openCategory("expense", category)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Últimas transações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...summary.current].sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 8).map((tx: any) => (
              <div key={tx.id} className="flex items-center gap-3 py-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}
                >
                  {tx.type === "income" ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{tx.description}</div>
                  <div className="text-xs text-muted-foreground">{tx.categories?.name ?? "—"}</div>
                </div>
                <div
                  className={`font-mono ${tx.type === "income" ? "text-income" : "text-expense"}`}
                >
                  {tx.type === "income" ? "+" : "-"}
                  {formatCurrency(Number(tx.amount), currency, privacy)}
                </div>
              </div>
            ))}
            {!hasData && (
              <EmptyState
                icon={Receipt}
                title="Sem transações neste período"
                description="Crie uma transação para começar."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone?: "income" | "expense";
}) {
  const toneClass =
    tone === "income"
      ? "text-income bg-income/10"
      : tone === "expense"
        ? "text-expense bg-expense/10"
        : "text-primary bg-primary/10";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
            <div className="font-mono text-xl md:text-2xl mt-1">{value}</div>
          </div>
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}
          >
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub: string;
  positive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={`mt-1 font-mono text-xl ${
            positive === true ? "text-income" : positive === false ? "text-expense" : ""
          }`}
        >
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function AudienceCard({
  icon: Icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: any;
  label: string;
  value: number;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="text-left" onClick={onClick}>
      <Card className="h-full transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
        <CardContent className="flex h-full items-center gap-4 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 font-mono text-2xl">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
          </div>
          <span className="text-xs font-medium text-primary">Ver transações</span>
        </CardContent>
      </Card>
    </button>
  );
}

type CategoryBenchmark = {
  name: string;
  current: number;
  average: number;
  difference: number;
  differencePct: number;
};

function CategoryComparison({
  title,
  description,
  tone,
  data,
  colors,
  currency,
  privacy,
  onSelect,
}: {
  title: string;
  description: string;
  tone: "income" | "expense";
  data: CategoryBenchmark[];
  colors: Array<{ name: string; color: string; value: number }>;
  currency: string;
  privacy: boolean;
  onSelect: (category: string) => void;
}) {
  const maxValue = Math.max(1, ...data.map((item) => Math.max(item.current, item.average)));
  const colorMap = new Map(colors.map((item) => [item.name, item.color]));
  const toneClass = tone === "income" ? "bg-income" : "bg-expense";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${toneClass}`} /> Mês selecionado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/55" /> Média dos meses anteriores
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {data.map((item) => {
          const currentWidth = item.current ? Math.max(2, (item.current / maxValue) * 100) : 0;
          const averageWidth = item.average ? Math.max(2, (item.average / maxValue) * 100) : 0;
          const differenceTone =
            item.difference === 0
              ? "text-muted-foreground"
              : tone === "income"
                ? item.difference > 0
                  ? "text-income"
                  : "text-expense"
                : item.difference > 0
                  ? "text-expense"
                  : "text-income";
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => onSelect(item.name)}
              className="group w-full rounded-xl border border-transparent px-2 py-3 text-left transition hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Abrir transações da categoria ${item.name}`}
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(135px,0.7fr)_minmax(180px,1.7fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          colorMap.get(item.name) ||
                          (tone === "income" ? "var(--income)" : "var(--expense)"),
                      }}
                    />
                    <span className="truncate text-sm font-semibold">{item.name}</span>
                  </div>
                  <div className={`mt-1 text-xs ${differenceTone}`}>
                    {item.average
                      ? `${item.difference >= 0 ? "+" : "−"}${formatCurrency(Math.abs(item.difference), currency, privacy)} vs média`
                      : "Sem histórico anterior"}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${toneClass}`}
                      style={{ width: `${currentWidth}%` }}
                    />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-muted-foreground/55"
                      style={{ width: `${averageWidth}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm font-semibold">
                    {formatCurrency(item.current, currency, privacy)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    média {formatCurrency(item.average, currency, privacy)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {!data.length && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sem dados no período e sem histórico anterior.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
