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
import { Button } from "@/components/ui/button";
import { formatCurrency, monthLabel } from "@/lib/format";
import { L } from "@/lib/labels";
import { buildCashFlowProjection, dashboardSummary, type OrnaTransaction } from "@/lib/orna-logic";
import { profitThroughSelectedMonth } from "@/lib/dashboard-profit";
import { fetchSupabasePages } from "@/lib/supabase-pagination";
import {
  buildDashboardAccountGroups,
  matchesDashboardAccountGroup,
} from "@/lib/dashboard-account-groups";
import {
  financialDateForTransaction,
  isCheckingAccountCashFlowTransaction,
  isConsumptionTransaction,
  netCardPaymentOffsets,
  type ReconciliationTransaction,
} from "@/lib/credit-card-reconciliation";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ChartNoAxesCombined,
  CircleDollarSign,
  Gauge,
  LayoutDashboard,
  ListTree,
  TriangleAlert,
  Wallet,
  TrendingUp,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const NOW = new Date();
type DashboardView = "executive" | "analytical";
type AccountBalanceRow = {
  current_manual_balance?: number | string | null;
  initial_balance?: number | string | null;
};

function Dashboard() {
  const navigate = Route.useNavigate();
  const { workspace } = useCurrentWorkspace();
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [accountFilterId, setAccountFilterId] = useState("all");
  const [view, setView] = useState<DashboardView>("executive");

  const wsId = workspace?.id;
  const privacy = workspace?.privacy_mode ?? false;
  const currency = workspace?.currency ?? "BRL";
  const { labelOverrides, hiddenCards } = useCustomizations(wsId);
  const {
    cardOrder,
    hiddenCards: hiddenCards2,
    dashboardProfitSummaryEnabled,
  } = useCustomizedUI(wsId);
  const t = L(workspace?.type ?? "personal", labelOverrides);

  const { data: yearTxs } = useQuery({
    queryKey: ["transactions-dashboard-period", wsId, year],
    enabled: !!wsId,
    queryFn: () =>
      fetchSupabasePages((from, to) =>
        supabase
          .from("transactions")
          .select(
            "id,date,type,amount,description,counterparty,status,category_id,account_id,credit_card_id,financial_role,reversal_of_transaction_id,linked_account_id,linked_credit_card_id,invoice_month,categories!transactions_category_id_fkey(name,color)",
          )
          .eq("workspace_id", wsId!)
          .in("year", [year, year - 1])
          .order("date", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
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

  const { data: creditCards = [] } = useQuery({
    queryKey: ["credit-cards", "dashboard", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("id,name,institution")
        .eq("workspace_id", wsId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const selectedMonthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const { data: cashFlowEntries = [] } = useQuery({
    queryKey: ["cash_flow_entries", wsId, "dashboard"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_flow_entries")
        .select("*, categories(name)")
        .eq("workspace_id", wsId)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const accountGroups = useMemo(
    () => buildDashboardAccountGroups(accounts ?? [], creditCards),
    [accounts, creditCards],
  );
  const selectedAccountGroup =
    accountFilterId === "all"
      ? null
      : (accountGroups.find((group) => group.account.id === accountFilterId) ?? null);
  const effectiveAccountFilterId = selectedAccountGroup ? accountFilterId : "all";
  const filteredYearTxs = useMemo(
    () =>
      selectedAccountGroup
        ? (yearTxs ?? []).filter((transaction) =>
            matchesDashboardAccountGroup(transaction, selectedAccountGroup),
          )
        : (yearTxs ?? []),
    [yearTxs, selectedAccountGroup],
  );

  const { data: monthlyBalance } = useQuery({
    queryKey: ["cash_flow_monthly_balances", wsId, selectedMonthStart, "dashboard"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_flow_monthly_balances")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("balance_month", selectedMonthStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: cashFlowTransactions = [] } = useQuery({
    queryKey: ["transactions", wsId, "dashboard-cash-flow", year, month],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id,date,type,amount,description,counterparty,status,account_id,credit_card_id,financial_role,reversal_of_transaction_id,accounts!inner(type),categories!transactions_category_id_fkey(name,color)",
        )
        .eq("workspace_id", wsId)
        .eq("accounts.type", "checking")
        .gte("date", selectedMonthStart)
        .lte("date", selectedMonthEnd)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(
    () =>
      dashboardSummary(
        netCardPaymentOffsets(filteredYearTxs as OrnaTransaction[])
          .filter(isConsumptionTransaction)
          .map((transaction) => ({
            ...transaction,
            date: financialDateForTransaction(transaction),
          })),
        month,
        year,
      ),
    [filteredYearTxs, month, year],
  );
  const totals = {
    income: summary.income,
    expense: summary.expense,
    net: summary.balance,
  };
  const profitSummary = useMemo(
    () => profitThroughSelectedMonth(summary.monthly, month),
    [summary.monthly, month],
  );
  const cashFlowProjection = useMemo(
    () =>
      buildCashFlowProjection({
        entries: cashFlowEntries,
        transactions: (cashFlowTransactions as unknown as ReconciliationTransaction[]).filter(
          isCheckingAccountCashFlowTransaction,
        ) as OrnaTransaction[],
        month,
        year,
        monthsCount: 1,
        startingCash: Number(monthlyBalance?.starting_balance ?? 0),
      }),
    [cashFlowEntries, cashFlowTransactions, month, monthlyBalance, year],
  );
  const yearTotals = useMemo(
    () =>
      summary.monthly.reduce(
        (acc, item) => ({
          income: acc.income + item.income,
          expense: acc.expense + item.expense,
          balance: acc.balance + item.balance,
          count: acc.count + item.count,
        }),
        { income: 0, expense: 0, balance: 0, count: 0 },
      ),
    [summary.monthly],
  );
  const monthlyChart = useMemo(
    () =>
      summary.monthly.map((item) => ({
        ...item,
        label: monthLabel(item.month).slice(0, 3),
      })),
    [summary.monthly],
  );
  const projectionChart = useMemo(
    () =>
      cashFlowProjection.daily.map((day) => ({
        ...day,
        label: day.dayLabel,
        actualExpenseBar: day.actualExpense ? -day.actualExpense : 0,
        projectedExpenseBar: day.projectedExpense ? -day.projectedExpense : 0,
      })),
    [cashFlowProjection],
  );

  const accountsBalance = useMemo(() => {
    if (!accounts) return 0;
    const visibleAccounts = selectedAccountGroup
      ? accounts.filter((account) => account.id === selectedAccountGroup.account.id)
      : accounts;
    return visibleAccounts.reduce(
      (sum: number, account: AccountBalanceRow) =>
        sum + Number(account.current_manual_balance ?? account.initial_balance ?? 0),
      0,
    );
  }, [accounts, selectedAccountGroup]);

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
        helpKey="financial.dashboard"
        description={`Visão financeira de ${workspace.name}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <div className="flex rounded-lg border border-border bg-muted/35 p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "executive" ? "default" : "ghost"}
                className="h-8 gap-1.5"
                onClick={() => setView("executive")}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Executivo
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "analytical" ? "default" : "ghost"}
                className="h-8 gap-1.5"
                onClick={() => setView("analytical")}
              >
                <ChartNoAxesCombined className="h-3.5 w-3.5" />
                Analítico
              </Button>
            </div>
            <Select value={effectiveAccountFilterId} onValueChange={setAccountFilterId}>
              <SelectTrigger className="w-[230px] max-w-full">
                <SelectValue placeholder="Todas as contas e cartões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas e cartões</SelectItem>
                {accountGroups.map((group) => (
                  <SelectItem key={group.account.id} value={group.account.id}>
                    {group.account.name}
                    {group.cards.length > 0
                      ? ` + ${group.cards.length} cartão${group.cards.length === 1 ? "" : "ões"}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {selectedAccountGroup && (
        <div className="mb-4 text-sm text-muted-foreground">
          Exibindo {selectedAccountGroup.account.name}
          {selectedAccountGroup.cards.length > 0 && (
            <> com {selectedAccountGroup.cards.map((card) => card.name).join(", ")}</>
          )}
          .
        </div>
      )}

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
                  motif="/brand/motifs/arch-wine.png"
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
                  motif="/brand/motifs/bowl-wine.png"
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
                  motif="/brand/motifs/curve-wine.png"
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
                  motif="/brand/motifs/circle-wine.png"
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

      {view === "executive" ? (
        <ExecutiveDashboard
          summary={summary}
          projection={cashFlowProjection}
          month={month}
          year={year}
          currency={currency}
          privacy={privacy}
          isAtelier={workspace.is_atelier}
          incomeLabel={t.income}
          expenseLabel={t.expense}
          hasData={hasData}
          onOpenCategory={openCategory}
        />
      ) : (
        <AnalyticalDashboard
          summary={summary}
          profitSummary={profitSummary}
          projection={cashFlowProjection}
          projectionChart={projectionChart}
          monthlyChart={monthlyChart}
          yearTotals={yearTotals}
          month={month}
          year={year}
          currency={currency}
          privacy={privacy}
          isAtelier={workspace.is_atelier}
          incomeLabel={t.income}
          expenseLabel={t.expense}
          incomeByCategory={incomeByCategory}
          expenseByCategory={expenseByCategory}
          dashboardProfitSummaryEnabled={dashboardProfitSummaryEnabled}
          hasData={hasData}
          onOpenCategory={openCategory}
        />
      )}
    </PageContainer>
  );
}

type DashboardSummaryData = ReturnType<typeof dashboardSummary>;
type DashboardProjection = ReturnType<typeof buildCashFlowProjection>;
type MonthlyChartRow = DashboardSummaryData["monthly"][number] & { label: string };
type ProjectionChartRow = DashboardProjection["daily"][number] & {
  label: string;
  actualExpenseBar: number;
  projectedExpenseBar: number;
};

function ExecutiveDashboard({
  summary,
  projection,
  month,
  year,
  currency,
  privacy,
  isAtelier,
  incomeLabel,
  expenseLabel,
  hasData,
  onOpenCategory,
}: {
  summary: DashboardSummaryData;
  projection: DashboardProjection;
  month: number;
  year: number;
  currency: string;
  privacy: boolean;
  isAtelier: boolean;
  incomeLabel: string;
  expenseLabel: string;
  hasData: boolean;
  onOpenCategory: (type: "income" | "expense", category: string) => void;
}) {
  const coverage = summary.expense ? summary.income / summary.expense : summary.income ? 1 : 0;
  const biggestIncome = summary.incomeCategories[0];
  const biggestExpense = summary.expenseCategories[0];
  return (
    <>
      <div className="mb-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.07]">
          <CardContent className="relative p-5 md:p-6">
            <img
              src="/brand/motifs/curve-wine.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -right-12 h-52 w-52 opacity-[0.06]"
            />
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Resultado de {monthLabel(month)} de {year}
              </div>
              <div
                className={`mt-2 font-mono text-3xl font-semibold md:text-4xl ${summary.balance >= 0 ? "text-income" : "text-expense"}`}
              >
                {formatCurrency(summary.balance, currency, privacy)}
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {summary.balance >= 0
                  ? `O período fechou positivo. As ${incomeLabel.toLowerCase()} superaram os ${expenseLabel.toLowerCase()}.`
                  : `O período fechou negativo. As ${incomeLabel.toLowerCase()} cobriram ${(coverage * 100).toFixed(1)}% dos ${expenseLabel.toLowerCase()}.`}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border bg-background/75 px-3 py-1.5 text-foreground">
                  {summary.count} transações
                </span>
                <span className="rounded-full border border-border bg-background/75 px-3 py-1.5 text-foreground">
                  {summary.metrics.balanceDelta >= 0 ? "Melhora" : "Piora"} de{" "}
                  {formatCurrency(Math.abs(summary.metrics.balanceDelta), currency, privacy)} vs.
                  mês anterior
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        <CashFlowProjectionCard
          projection={projection}
          month={month}
          year={year}
          currency={currency}
          privacy={privacy}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <CategoryRanking
          title={`Maiores ${incomeLabel.toLowerCase()} do mês`}
          description="Categorias que mais contribuíram para as entradas."
          data={summary.incomeCategories}
          tone="income"
          currency={currency}
          privacy={privacy}
          onSelect={(category) => onOpenCategory("income", category)}
        />
        <CategoryRanking
          title={`Maiores ${expenseLabel.toLowerCase()} do mês`}
          description="Categorias que mais consumiram recursos."
          data={summary.expenseCategories}
          tone="expense"
          currency={currency}
          privacy={privacy}
          onSelect={(category) => onOpenCategory("expense", category)}
        />
      </div>

      <MonthlyHighlights
        summary={summary}
        currency={currency}
        privacy={privacy}
        onSelect={(category) => onOpenCategory("expense", category)}
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4" />
            Leituras importantes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <InsightTile
            label="Cobertura dos gastos"
            value={`${(coverage * 100).toFixed(1)}%`}
            description="Parcela dos gastos coberta pelas entradas do mês."
            tone={coverage >= 1 ? "income" : "expense"}
          />
          <InsightTile
            label="Maior fonte de entrada"
            value={biggestIncome?.name ?? "Sem entradas"}
            description={
              biggestIncome
                ? formatCurrency(biggestIncome.value, currency, privacy)
                : "Nenhuma entrada registrada no período."
            }
            tone="income"
          />
          <InsightTile
            label="Maior centro de gasto"
            value={biggestExpense?.name ?? "Sem gastos"}
            description={
              biggestExpense
                ? formatCurrency(biggestExpense.value, currency, privacy)
                : "Nenhum gasto registrado no período."
            }
            tone="expense"
          />
        </CardContent>
      </Card>

      {isAtelier && (
        <AudienceSummary
          summary={summary}
          currency={currency}
          privacy={privacy}
          onOpenCategory={onOpenCategory}
        />
      )}

      <RecentTransactions
        transactions={summary.current}
        currency={currency}
        privacy={privacy}
        hasData={hasData}
      />
    </>
  );
}

function AnalyticalDashboard({
  summary,
  profitSummary,
  projection,
  projectionChart,
  monthlyChart,
  yearTotals,
  month,
  year,
  currency,
  privacy,
  isAtelier,
  incomeLabel,
  expenseLabel,
  incomeByCategory,
  expenseByCategory,
  dashboardProfitSummaryEnabled,
  hasData,
  onOpenCategory,
}: {
  summary: DashboardSummaryData;
  profitSummary: ReturnType<typeof profitThroughSelectedMonth>;
  projection: DashboardProjection;
  projectionChart: ProjectionChartRow[];
  monthlyChart: MonthlyChartRow[];
  yearTotals: { income: number; expense: number; balance: number; count: number };
  month: number;
  year: number;
  currency: string;
  privacy: boolean;
  isAtelier: boolean;
  incomeLabel: string;
  expenseLabel: string;
  incomeByCategory: Array<{ name: string; color: string; value: number }>;
  expenseByCategory: Array<{ name: string; color: string; value: number }>;
  dashboardProfitSummaryEnabled: boolean;
  hasData: boolean;
  onOpenCategory: (type: "income" | "expense", category: string) => void;
}) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Margem líquida"
          value={`${(summary.metrics.netMargin * 100).toFixed(1)}%`}
          sub={`${formatCurrency(summary.metrics.balanceDelta, currency, privacy)} vs mês anterior`}
          positive={summary.metrics.netMargin >= 0}
        />
        <MetricCard
          label="Despesas / receitas"
          value={
            summary.metrics.expenseRatio == null
              ? "—"
              : `${(summary.metrics.expenseRatio * 100).toFixed(1)}%`
          }
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
        <MetricCard
          label={`Entradas em ${year}`}
          value={formatCurrency(yearTotals.income, currency, privacy)}
          sub={`${yearTotals.count} transações acumuladas`}
          positive
        />
        <MetricCard
          label={`Gastos em ${year}`}
          value={formatCurrency(yearTotals.expense, currency, privacy)}
          sub={`Média de ${formatCurrency(summary.metrics.averageMonthlyExpense, currency, privacy)}`}
          positive={false}
        />
        <MetricCard
          label={`Resultado em ${year}`}
          value={formatCurrency(yearTotals.balance, currency, privacy)}
          sub="Entradas menos gastos acumulados"
          positive={yearTotals.balance >= 0}
        />
        <MetricCard
          label="Saldo previsto do mês"
          value={formatCurrency(projection.endingActualForecast, currency, privacy)}
          sub={`${projection.projectedEvents.length} previsão(ões) cadastrada(s)`}
          positive={projection.endingActualForecast >= 0}
        />
      </div>

      {dashboardProfitSummaryEnabled && (
        <ProfitSummaryCard
          profitSummary={profitSummary}
          month={month}
          year={year}
          currency={currency}
          privacy={privacy}
        />
      )}

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <MonthlyPerformanceChart
          data={monthlyChart}
          year={year}
          currency={currency}
          privacy={privacy}
        />
        <CashFlowProjectionChart
          data={projectionChart}
          projection={projection}
          month={month}
          currency={currency}
          privacy={privacy}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryComparison
          title={`${incomeLabel} por categoria`}
          description="Valor do mês comparado com a média dos meses anteriores."
          tone="income"
          data={summary.incomeBenchmarks}
          colors={incomeByCategory}
          currency={currency}
          privacy={privacy}
          onSelect={(category) => onOpenCategory("income", category)}
        />
        <CategoryComparison
          title={`${expenseLabel} por categoria`}
          description="Valor do mês comparado com a média dos meses anteriores."
          tone="expense"
          data={summary.expenseBenchmarks}
          colors={expenseByCategory}
          currency={currency}
          privacy={privacy}
          onSelect={(category) => onOpenCategory("expense", category)}
        />
      </div>

      <MonthlyHighlights
        summary={summary}
        currency={currency}
        privacy={privacy}
        onSelect={(category) => onOpenCategory("expense", category)}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <MovementRanking
          title="Maiores receitas individuais"
          icon={CircleDollarSign}
          transactions={summary.topIncome}
          tone="income"
          currency={currency}
          privacy={privacy}
        />
        <MovementRanking
          title="Maiores gastos individuais"
          icon={ListTree}
          transactions={summary.topExpense}
          tone="expense"
          currency={currency}
          privacy={privacy}
        />
      </div>

      {isAtelier && (
        <AudienceSummary
          summary={summary}
          currency={currency}
          privacy={privacy}
          onOpenCategory={onOpenCategory}
        />
      )}

      <RecentTransactions
        transactions={summary.current}
        currency={currency}
        privacy={privacy}
        hasData={hasData}
      />
    </>
  );
}

function MonthlyHighlights({
  summary,
  currency,
  privacy,
  onSelect,
}: {
  summary: DashboardSummaryData;
  currency: string;
  privacy: boolean;
  onSelect: (category: string) => void;
}) {
  const surprisingExpenses = summary.expenseBenchmarks
    .filter((item) => item.current > item.average && item.current > 0)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 3);
  const previousByCategory = new Map(
    summary.previous.expenseCategories.map((item) => [item.name, item.value]),
  );
  const monthGrowth = summary.expenseCategories
    .map((item) => {
      const previous = previousByCategory.get(item.name) ?? 0;
      return {
        name: item.name,
        current: item.value,
        previous,
        difference: item.value - previous,
        differencePct: previous ? (item.value - previous) / previous : null,
      };
    })
    .filter((item) => item.difference > 0)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 3);
  const hasHighlights = surprisingExpenses.length > 0 || monthGrowth.length > 0;

  return (
    <Card className="mb-4 overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/[0.035]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="h-4 w-4 text-primary" />
          Destaques do mês
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gastos acima do comportamento histórico e categorias que mais cresceram frente ao mês
          anterior.
        </p>
      </CardHeader>
      <CardContent>
        {!hasHighlights ? (
          <div className="rounded-xl border border-dashed bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum aumento relevante de gastos foi identificado neste período.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <HighlightList
              title="Acima da média"
              description="Maiores desvios em reais contra a média dos meses anteriores."
              items={surprisingExpenses.map((item) => ({
                name: item.name,
                value: item.current,
                delta: item.difference,
                detail:
                  item.average > 0
                    ? `${formatPercentage(item.differencePct)} acima da média de ${formatCurrency(item.average, currency, privacy)}`
                    : "Novo gasto sem média histórica",
              }))}
              currency={currency}
              privacy={privacy}
              onSelect={onSelect}
            />
            <HighlightList
              title="Maiores crescimentos"
              description="Categorias com maior aumento em reais comparado ao mês anterior."
              items={monthGrowth.map((item) => ({
                name: item.name,
                value: item.current,
                delta: item.difference,
                detail:
                  item.differencePct == null
                    ? "Novo gasto neste mês"
                    : `${formatPercentage(item.differencePct)} vs. ${formatCurrency(item.previous, currency, privacy)} no mês anterior`,
              }))}
              currency={currency}
              privacy={privacy}
              onSelect={onSelect}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HighlightList({
  title,
  description,
  items,
  currency,
  privacy,
  onSelect,
}: {
  title: string;
  description: string;
  items: Array<{ name: string; value: number; delta: number; detail: string }>;
  currency: string;
  privacy: boolean;
  onSelect: (category: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-background/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <TrendingUp className="h-4 w-4 shrink-0 text-expense" />
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <button
            key={item.name}
            type="button"
            onClick={() => onSelect(item.name)}
            className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-expense/10 text-xs font-semibold text-expense">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-sm">
                {formatCurrency(item.value, currency, privacy)}
              </span>
              <span className="block text-[11px] font-medium text-expense">
                +{formatCurrency(item.delta, currency, privacy)}
              </span>
            </span>
          </button>
        ))}
        {!items.length && (
          <div className="py-5 text-center text-xs text-muted-foreground">
            Nenhum crescimento nesta comparação.
          </div>
        )}
      </div>
    </div>
  );
}

function formatPercentage(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function CashFlowProjectionCard({
  projection,
  month,
  year,
  currency,
  privacy,
}: {
  projection: DashboardProjection;
  month: number;
  year: number;
  currency: string;
  privacy: boolean;
}) {
  const hasForecast = projection.projectedEvents.length > 0;
  return (
    <Card className="border-primary/20 bg-primary/[0.025]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" />
          Projeção de caixa · {monthLabel(month)} {year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-background/75 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Saldo previsto
            </div>
            <div
              className={`mt-1 font-mono text-xl ${projection.endingActualForecast >= 0 ? "text-income" : "text-expense"}`}
            >
              {formatCurrency(projection.endingActualForecast, currency, privacy)}
            </div>
          </div>
          <div className="rounded-xl border bg-background/75 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Menor caixa
            </div>
            <div
              className={`mt-1 font-mono text-xl ${projection.minCash >= 0 ? "" : "text-expense"}`}
            >
              {formatCurrency(projection.minCash, currency, privacy)}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Receitas previstas</span>
            <strong className="mt-1 block text-income">
              {formatCurrency(projection.totalProjectedIncome, currency, privacy)}
            </strong>
          </div>
          <div>
            <span className="text-muted-foreground">Despesas previstas</span>
            <strong className="mt-1 block text-expense">
              {formatCurrency(projection.totalProjectedExpense, currency, privacy)}
            </strong>
          </div>
        </div>
        {!hasForecast && (
          <p className="mt-3 text-xs text-muted-foreground">
            Não há previsões cadastradas para este mês. O saldo considera apenas o realizado e o
            saldo inicial.
          </p>
        )}
        {projection.firstNegativeDate && (
          <div className="mt-3 flex gap-2 rounded-lg bg-expense/10 p-2.5 text-xs text-expense">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>
              Previsão de caixa negativo em {formatDate(projection.firstNegativeDate)}. Necessidade
              estimada: {formatCurrency(projection.cashNeedAmount, currency, privacy)}.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryRanking({
  title,
  description,
  data,
  tone,
  currency,
  privacy,
  onSelect,
}: {
  title: string;
  description: string;
  data: Array<{ name: string; color: string; value: number }>;
  tone: "income" | "expense";
  currency: string;
  privacy: boolean;
  onSelect: (category: string) => void;
}) {
  const top = data.slice(0, 5);
  const max = Math.max(1, ...top.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {top.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => onSelect(item.name)}
            className="w-full rounded-xl px-2 py-2 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{item.name}</span>
              <span className="shrink-0 font-mono">
                {formatCurrency(item.value, currency, privacy)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${tone === "income" ? "bg-income" : "bg-expense"}`}
                  style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
                />
              </div>
              <span className="w-12 text-right text-[10px] text-muted-foreground">
                {total ? `${((item.value / total) * 100).toFixed(1)}%` : "0%"}
              </span>
            </div>
          </button>
        ))}
        {!top.length && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sem movimentações deste tipo no período.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightTile({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "income" | "expense";
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-2 text-lg font-semibold ${tone === "income" ? "text-income" : "text-expense"}`}
      >
        {value}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function ProfitSummaryCard({
  profitSummary,
  month,
  year,
  currency,
  privacy,
}: {
  profitSummary: ReturnType<typeof profitThroughSelectedMonth>;
  month: number;
  year: number;
  currency: string;
  privacy: boolean;
}) {
  return (
    <Card className="mb-4 overflow-hidden border-primary/25 bg-primary/[0.035]">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium">Indicador de lucro</div>
            <div className="text-xs text-muted-foreground">
              Mês selecionado e média desde janeiro
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-background/75 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Lucro de {monthLabel(month)}
            </div>
            <div
              className={`mt-1 font-mono text-2xl ${profitSummary.selectedProfit >= 0 ? "text-income" : "text-expense"}`}
            >
              {formatCurrency(profitSummary.selectedProfit, currency, privacy)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Receitas menos despesas</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/75 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Lucro médio mensal em {year}
            </div>
            <div
              className={`mt-1 font-mono text-2xl ${profitSummary.averageMonthlyProfit >= 0 ? "text-income" : "text-expense"}`}
            >
              {formatCurrency(profitSummary.averageMonthlyProfit, currency, privacy)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Janeiro a {monthLabel(month)} · {profitSummary.monthsIncluded} meses
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyPerformanceChart({
  data,
  year,
  currency,
  privacy,
}: {
  data: MonthlyChartRow[];
  year: number;
  currency: string;
  privacy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Desempenho mensal · {year}</CardTitle>
        <p className="text-xs text-muted-foreground">Entradas, gastos e resultado mês a mês.</p>
      </CardHeader>
      <CardContent className="h-80 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.22} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(value) => compactValue(value, privacy)} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                formatCurrency(Number(value), currency, privacy),
                String(name),
              ]}
            />
            <Legend verticalAlign="top" height={34} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" opacity={0.5} />
            <Bar
              dataKey="income"
              name="Entradas"
              fill="var(--income)"
              opacity={0.78}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="expense"
              name="Gastos"
              fill="var(--expense)"
              opacity={0.72}
              radius={[4, 4, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="balance"
              name="Resultado"
              stroke="var(--primary)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function CashFlowProjectionChart({
  data,
  projection,
  month,
  currency,
  privacy,
}: {
  data: ProjectionChartRow[];
  projection: DashboardProjection;
  month: number;
  currency: string;
  privacy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Projeção de caixa · {monthLabel(month)}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Realizado até hoje e previsões cadastradas para o restante do mês.
        </p>
      </CardHeader>
      <CardContent className="h-80 p-3">
        {projection.projectedEvents.length === 0 && projection.actualEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados realizados ou previstos para o período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.22} />
              <XAxis dataKey="label" minTickGap={24} fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(value) => compactValue(value, privacy)} />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  formatCurrency(Math.abs(Number(value)), currency, privacy),
                  String(name),
                ]}
              />
              <Legend verticalAlign="top" height={34} />
              <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
              <Bar
                dataKey="actualIncome"
                name="Entradas realizadas"
                fill="var(--income)"
                opacity={0.7}
              />
              <Bar
                dataKey="actualExpenseBar"
                name="Saídas realizadas"
                fill="var(--expense)"
                opacity={0.7}
              />
              <Line
                type="monotone"
                dataKey="projectedBalance"
                name="Saldo previsto"
                stroke="#2563eb"
                strokeWidth={2.5}
                strokeDasharray="7 5"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actualForecastBalance"
                name="Realizado + previsto"
                stroke="var(--income)"
                strokeWidth={2.5}
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function MovementRanking({
  title,
  icon: Icon,
  transactions,
  tone,
  currency,
  privacy,
}: {
  title: string;
  icon: LucideIcon;
  transactions: OrnaTransaction[];
  tone: "income" | "expense";
  currency: string;
  privacy: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {transactions.map((transaction, index) => (
          <div
            key={transaction.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {transaction.description || "Sem descrição"}
              </div>
              <div className="text-xs text-muted-foreground">
                {transaction.categories?.name ?? "Sem categoria"} · {formatDate(transaction.date)}
              </div>
            </div>
            <span
              className={`shrink-0 font-mono text-sm ${tone === "income" ? "text-income" : "text-expense"}`}
            >
              {formatCurrency(Math.abs(Number(transaction.amount)), currency, privacy)}
            </span>
          </div>
        ))}
        {!transactions.length && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sem movimentações deste tipo no mês.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AudienceSummary({
  summary,
  currency,
  privacy,
  onOpenCategory,
}: {
  summary: DashboardSummaryData;
  currency: string;
  privacy: boolean;
  onOpenCategory: (type: "income" | "expense", category: string) => void;
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <AudienceCard
        icon={Users}
        label="Alunos pagantes — aulas regulares"
        value={summary.audience.regularPayingStudents}
        sub={`${summary.audience.regularPayments} recebimento(s) · ${formatCurrency(summary.audience.regularRevenue, currency, privacy)}`}
        onClick={() => onOpenCategory("income", "Aulas regulares")}
      />
      <AudienceCard
        icon={CalendarCheck}
        label="Participantes de workshops no mês"
        value={summary.audience.workshopParticipants}
        sub={`${summary.audience.workshopPayments} recebimento(s) · estimativa por R$ 290 com até 10% de desconto`}
        onClick={() => onOpenCategory("income", "Workshops")}
      />
    </div>
  );
}

function RecentTransactions({
  transactions,
  currency,
  privacy,
  hasData,
}: {
  transactions: OrnaTransaction[];
  currency: string;
  privacy: boolean;
  hasData: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Últimas transações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {[...transactions]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 8)
          .map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${tx.type === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}
              >
                {tx.type === "income" ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{tx.description}</div>
                <div className="text-xs text-muted-foreground">{tx.categories?.name ?? "—"}</div>
              </div>
              <div className={`font-mono ${tx.type === "income" ? "text-income" : "text-expense"}`}>
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
  );
}

function compactValue(value: number, privacy: boolean) {
  if (privacy) return "•";
  return Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatDate(value: string) {
  const match = String(value)
    .slice(0, 10)
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  motif,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "income" | "expense";
  motif: string;
}) {
  const toneClass =
    tone === "income"
      ? "text-income bg-income/10"
      : tone === "expense"
        ? "text-expense bg-expense/10"
        : "text-primary bg-primary/10";
  return (
    <Card className="group relative overflow-hidden border-border/70 bg-card/95 transition hover:-translate-y-0.5 hover:shadow-md">
      <img
        src={motif}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -right-6 h-28 w-28 object-contain opacity-[0.07] transition duration-300 group-hover:opacity-[0.11]"
      />
      <CardContent className="relative z-10 p-4">
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
  icon: LucideIcon;
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
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/55" /> Média dos meses
            anteriores
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
