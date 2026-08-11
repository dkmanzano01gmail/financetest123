import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { buildCashFlowProjection, type CashFlowDay, type CashFlowEvent } from "@/lib/orna-logic";
import {
  AlertTriangle,
  CalendarRange,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/atelier/cash-flow")({
  component: CashFlowPage,
});

const sb = supabase as any;
const TODAY = new Date();
const emptyForm = () => ({
  entry_date: new Date().toISOString().slice(0, 10),
  specific_date: new Date().toISOString().slice(0, 10),
  type: "income",
  description: "",
  category_id: "",
  amount: "",
  recurrence: "monthly",
  status: "projected",
  is_active: true,
  day_of_month: "1",
  notes: "",
});

function CashFlowPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [month, setMonth] = useState(TODAY.getMonth() + 1);
  const [year, setYear] = useState(TODAY.getFullYear());
  const [monthsCount, setMonthsCount] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [balOpen, setBalOpen] = useState(false);
  const [balForm, setBalForm] = useState({ starting_balance: "0" });
  const selectedMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["cash_flow_entries", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("cash_flow_entries")
        .select("*, categories(name)")
        .eq("workspace_id", wsId)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: monthlyBalance } = useQuery({
    queryKey: ["cash_flow_monthly_balances", wsId, selectedMonthStart],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("cash_flow_monthly_balances")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("balance_month", selectedMonthStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const {
    data: transactions = [],
    error: transactionsError,
    isLoading: txLoading,
    isFetching: txFetching,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: [
      "transactions",
      wsId,
      "cash-flow",
      year,
      month,
      monthsCount,
    ],
    enabled: !!wsId,
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month - 1 + monthsCount, 0);
      const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
      const { data, error } = await sb
        .from("transactions")
        .select(
          "id,date,type,amount,description,counterparty,status,account_id,credit_card_id,categories!transactions_category_id_fkey(name,color)",
        )
        .eq("workspace_id", wsId)
        .gte("date", start)
        .lte("date", end)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!wsId) return;

    const channel = supabase
      .channel(`cash-flow-transactions-${wsId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `workspace_id=eq.${wsId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["transactions", wsId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, wsId]);
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", wsId, "cash-flow"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("categories")
        .select("id,name,type,is_active")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const projectionStartCash = Number(monthlyBalance?.starting_balance ?? 0);

  const projection = useMemo(
    () =>
      buildCashFlowProjection({
        entries,
        transactions,
        month,
        year,
        monthsCount,
        startingCash: projectionStartCash,
      }),
    [entries, transactions, month, year, monthsCount, projectionStartCash],
  );

  const chart = useMemo(
    () =>
      projection.daily.map((day) => ({
        ...day,
        label: day.dayLabel,
        actualExpenseBar: day.actualExpense ? -day.actualExpense : 0,
        actualForecastBalance: day.actualForecastBalance,
      })),
    [projection],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) throw new Error("Informe a descrição.");
      const amount = parseLocaleAmount(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor positivo.");
      const recurrence = form.recurrence;
      const specificDate = recurrence === "none" ? form.specific_date || form.entry_date : null;
      const dayOfMonth =
        recurrence === "monthly"
          ? Math.min(31, Math.max(1, Number.parseInt(form.day_of_month || "1", 10)))
          : null;
      const payload = {
        workspace_id: wsId,
        entry_date: specificDate || form.entry_date,
        specific_date: specificDate,
        type: form.type,
        description: form.description.trim(),
        category_id: form.category_id || null,
        amount,
        recurrence,
        status: "projected",
        is_active: form.is_active,
        day_of_month: dayOfMonth,
        notes: form.notes.trim() || null,
      };
      const { error } = editId
        ? await sb
            .from("cash_flow_entries")
            .update(payload)
            .eq("id", editId)
            .eq("workspace_id", wsId)
        : await sb.from("cash_flow_entries").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash_flow_entries"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyForm());
      toast.success("Previsão salva");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("cash_flow_entries")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash_flow_entries"] });
      toast.success("Previsão removida");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (entry: any) => {
      const { error } = await sb
        .from("cash_flow_entries")
        .update({ is_active: entry.is_active === false })
        .eq("id", entry.id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash_flow_entries"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const balMut = useMutation({
    mutationFn: async () => {
      const balance = parseLocaleAmount(balForm.starting_balance);
      if (!Number.isFinite(balance)) throw new Error("Saldo inicial inválido.");
      const { error } = await sb.from("cash_flow_monthly_balances").upsert(
        {
          workspace_id: wsId,
          balance_month: selectedMonthStart,
          starting_balance: balance,
        },
        { onConflict: "workspace_id,balance_month" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash_flow_monthly_balances"] });
      setBalOpen(false);
      toast.success("Saldo inicial do mês atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openEdit(entry: any) {
    setEditId(entry.id);
    setForm({
      entry_date: entry.entry_date,
      specific_date: entry.specific_date ?? entry.entry_date,
      type: entry.type,
      description: entry.description,
      category_id: entry.category_id ?? "",
      amount: String(entry.amount),
      recurrence: entry.recurrence ?? "none",
      status: "projected",
      is_active: entry.is_active !== false,
      day_of_month: entry.day_of_month != null ? String(entry.day_of_month) : "1",
      notes: entry.notes ?? "",
    });
    setOpen(true);
  }

  const busy = entriesLoading || txLoading;

  return (
    <PageContainer>
      <PageHeader
        title="Fluxo de Caixa"
        description="Previsto × realizado, seguindo a conciliação diária do Apps Script"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBalForm({
                  starting_balance: String(monthlyBalance?.starting_balance ?? "0"),
                });
                setBalOpen(true);
              }}
            >
              Saldo inicial
            </Button>
            <Button
              onClick={() => {
                setEditId(null);
                setForm(emptyForm());
                setOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Nova previsão
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, index) => (
                <SelectItem key={index + 1} value={String(index + 1)}>
                  {monthLabel(index + 1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[TODAY.getFullYear() - 1, TODAY.getFullYear(), TODAY.getFullYear() + 1].map(
                (item) => (
                  <SelectItem key={item} value={String(item)}>
                    {item}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Select
            value={String(monthsCount)}
            onValueChange={(value) => setMonthsCount(Number(value))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 mês</SelectItem>
              <SelectItem value="2">2 meses</SelectItem>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto">
            <CalendarRange className="mr-1 h-3.5 w-3.5" />
            {projection.startDate} a {projection.endDate}
          </Badge>
          {txFetching && !txLoading && (
            <span className="text-xs text-muted-foreground">Atualizando transações…</span>
          )}
        </CardContent>
      </Card>

      {transactionsError && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <strong>Não foi possível carregar as transações realizadas.</strong>
              <div className="mt-1 text-xs text-muted-foreground">
                {transactionsError instanceof Error
                  ? transactionsError.message
                  : "Erro desconhecido ao consultar as transações."}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={txFetching}
              onClick={() => void refetchTransactions()}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo inicial"
          value={formatCurrency(projection.startingCash, currency, privacy)}
          sub={`${monthLabel(month)} de ${year}`}
        />
        <StatCard
          label="Entradas realizadas"
          value={formatCurrency(projection.totalActualIncome, currency, privacy)}
          tone="income"
          icon={TrendingUp}
        />
        <StatCard
          label="Saídas realizadas"
          value={formatCurrency(projection.totalActualExpense, currency, privacy)}
          tone="expense"
          icon={TrendingDown}
        />
        <StatCard
          label="Resultado realizado"
          value={formatCurrency(projection.actualNet, currency, privacy)}
          tone={projection.actualNet >= 0 ? "income" : "expense"}
          sub={`${projection.actualEvents.length} ${
            projection.actualEvents.length === 1 ? "transação" : "transações"
          }`}
        />
        <StatCard
          label="Receitas previstas"
          value={formatCurrency(projection.totalProjectedIncome, currency, privacy)}
          tone="income"
          icon={TrendingUp}
        />
        <StatCard
          label="Despesas previstas"
          value={formatCurrency(projection.totalProjectedExpense, currency, privacy)}
          tone="expense"
          icon={TrendingDown}
        />
        <StatCard
          label="Saldo previsto"
          value={formatCurrency(projection.endingCash, currency, privacy)}
          tone={projection.endingCash >= 0 ? "income" : "expense"}
        />
        <StatCard
          label="Menor caixa previsto"
          value={formatCurrency(projection.minCash, currency, privacy)}
          tone={projection.minCash >= 0 ? undefined : "expense"}
          sub={projection.minCashDate}
          icon={projection.minCash < 0 ? AlertTriangle : Wallet}
        />
      </div>

      {projection.firstNegativeDate && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <strong>Necessidade de caixa:</strong> o saldo previsto fica negativo em{" "}
              {projection.firstNegativeDate}. Reserva mínima sugerida:{" "}
              {formatCurrency(projection.cashNeedAmount, currency, privacy)}.
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Movimentação e saldo por dia</CardTitle>
          <p className="text-xs text-muted-foreground">
            Barras mostram entradas e saídas realizadas. Linhas mostram o saldo previsto e o saldo
            recalculado com o realizado. Passe o mouse em um dia para ver cada transação.
          </p>
        </CardHeader>
        <CardContent className="h-[26rem] p-3">
          {busy ? (
            <div className="pt-24 text-center text-sm text-muted-foreground">
              Carregando projeção…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="label" minTickGap={24} fontSize={11} />
                <YAxis
                  fontSize={11}
                  tickFormatter={(value) =>
                    privacy
                      ? "•"
                      : Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value)
                  }
                />
                <Tooltip
                  content={<CashFlowTooltip currency={currency} privacy={privacy} />}
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                />
                <Legend verticalAlign="top" height={36} />
                <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
                <Bar
                  dataKey="actualIncome"
                  name="Entradas realizadas"
                  fill="var(--income)"
                  opacity={0.72}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="actualExpenseBar"
                  name="Saídas realizadas"
                  fill="var(--expense)"
                  opacity={0.72}
                  radius={[0, 0, 4, 4]}
                />
                <Line
                  type="monotone"
                  dataKey="projectedBalance"
                  name="Saldo previsto"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="actualForecastBalance"
                  name="Saldo com realizado"
                  stroke="var(--income)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eventos previstos do período</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-auto p-0">
            {projection.projectedEvents.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Sem previsões ativas no período.
              </div>
            ) : (
              projection.projectedEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 border-t px-4 py-2 text-sm first:border-t-0"
                >
                  <span className="w-24 font-mono text-xs text-muted-foreground">{event.date}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{event.description}</div>
                    <div className="text-xs text-muted-foreground">{event.category}</div>
                  </div>
                  <span className={event.type === "income" ? "text-income" : "text-expense"}>
                    {event.type === "income" ? "+" : "-"}
                    {formatCurrency(event.amount, currency, privacy)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transações realizadas do período</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-auto p-0">
            {projection.actualEvents.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Sem transações realizadas no período.
              </div>
            ) : (
              projection.actualEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 border-t px-4 py-2 text-sm first:border-t-0"
                >
                  <span className="w-24 font-mono text-xs text-muted-foreground">{event.date}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{event.description}</div>
                    <div className="text-xs text-muted-foreground">{event.category}</div>
                  </div>
                  <span className={event.type === "income" ? "text-income" : "text-expense"}>
                    {event.type === "income" ? "+" : "-"}
                    {formatCurrency(event.amount, currency, privacy)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Sem previsões cadastradas"
          description="Cadastre receitas e despesas recorrentes ou únicas para projetar o caixa."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadastros de previsão</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Recorrência</th>
                  <th className="p-3">Data/Dia</th>
                  <th className="p-3">Ativo</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: any) => (
                  <tr key={entry.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{entry.description}</div>
                      {entry.notes && (
                        <div className="max-w-md truncate text-xs text-muted-foreground">
                          {entry.notes}
                        </div>
                      )}
                    </td>
                    <td className="p-3">{entry.categories?.name ?? "—"}</td>
                    <td className="p-3">{entry.type === "income" ? "Receita" : "Despesa"}</td>
                    <td className="p-3">{recurrenceLabel(entry.recurrence)}</td>
                    <td className="p-3 font-mono text-xs">
                      {entry.recurrence === "monthly"
                        ? `dia ${entry.day_of_month ?? 1}`
                        : (entry.specific_date ?? entry.entry_date)}
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={entry.is_active !== false}
                        onCheckedChange={() => toggleMut.mutate(entry)}
                      />
                    </td>
                    <td
                      className={`p-3 text-right font-mono ${entry.type === "income" ? "text-income" : "text-expense"}`}
                    >
                      {formatCurrency(Number(entry.amount), currency, privacy)}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => delMut.mutate(entry.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
            <DialogTitle>{editId ? "Editar previsão" : "Nova previsão"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value, category_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.category_id || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, category_id: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories
                    .filter((category: any) => category.type === form.type)
                    .map((category: any) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Recorrência</Label>
              <Select
                value={form.recurrence}
                onValueChange={(value) => setForm({ ...form, recurrence: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Única</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrence === "monthly" ? (
              <div className="space-y-1.5">
                <Label>Dia do mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.day_of_month}
                  onChange={(event) => setForm({ ...form, day_of_month: event.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>
                  {form.recurrence === "none" ? "Data específica" : "Primeira ocorrência"}
                </Label>
                <Input
                  type="date"
                  value={form.recurrence === "none" ? form.specific_date : form.entry_date}
                  onChange={(event) =>
                    setForm(
                      form.recurrence === "none"
                        ? {
                            ...form,
                            specific_date: event.target.value,
                            entry_date: event.target.value,
                          }
                        : { ...form, entry_date: event.target.value },
                    )
                  }
                />
              </div>
            )}
            <div className="col-span-2 space-y-1.5">
              <Label>Observações</Label>
              <Input
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(value) => setForm({ ...form, is_active: value })}
              />
              <Label>Ativo nas projeções</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={balOpen} onOpenChange={setBalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Saldo inicial de {monthLabel(month)} de {year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Saldo</Label>
              <Input
                inputMode="decimal"
                value={balForm.starting_balance}
                onChange={(event) =>
                  setBalForm({ ...balForm, starting_balance: event.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Se você não informar outro valor, este mês começa em R$ 0,00.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => balMut.mutate()} disabled={balMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function recurrenceLabel(value?: string) {
  return (
    (
      { none: "Única", weekly: "Semanal", monthly: "Mensal", yearly: "Anual" } as Record<
        string,
        string
      >
    )[value ?? ""] ??
    value ??
    "—"
  );
}

function CashFlowTooltip({
  active,
  payload,
  currency,
  privacy,
}: {
  active?: boolean;
  payload?: Array<{ payload?: CashFlowDay & { label: string; actualExpenseBar: number } }>;
  currency: string;
  privacy: boolean;
}) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;

  const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl">
      <div className="mb-2 border-b pb-2">
        <div className="font-semibold capitalize">{dateLabel}</div>
        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <TooltipMetric
            label="Entradas realizadas"
            value={day.actualIncome}
            currency={currency}
            privacy={privacy}
            tone="income"
          />
          <TooltipMetric
            label="Saídas realizadas"
            value={day.actualExpense}
            currency={currency}
            privacy={privacy}
            tone="expense"
          />
          <TooltipMetric
            label="Saldo previsto"
            value={day.projectedBalance}
            currency={currency}
            privacy={privacy}
          />
          <TooltipMetric
            label="Saldo com realizado"
            value={day.actualForecastBalance}
            currency={currency}
            privacy={privacy}
          />
        </div>
      </div>

      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        <TooltipEventList
          title="Transações realizadas"
          events={day.actualEvents}
          emptyMessage="Nenhuma transação realizada neste dia."
          currency={currency}
          privacy={privacy}
        />
        {day.projectedEvents.length > 0 && (
          <TooltipEventList
            title="Eventos previstos"
            events={day.projectedEvents}
            currency={currency}
            privacy={privacy}
          />
        )}
      </div>
    </div>
  );
}

function TooltipMetric({
  label,
  value,
  currency,
  privacy,
  tone,
}: {
  label: string;
  value: number | null;
  currency: string;
  privacy: boolean;
  tone?: "income" | "expense";
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div
        className={`font-mono font-semibold ${
          tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""
        }`}
      >
        {value == null ? "—" : formatCurrency(value, currency, privacy)}
      </div>
    </div>
  );
}

function TooltipEventList({
  title,
  events,
  emptyMessage,
  currency,
  privacy,
}: {
  title: string;
  events: CashFlowEvent[];
  emptyMessage?: string;
  currency: string;
  privacy: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {events.length === 0 ? (
        <div className="text-xs text-muted-foreground">{emptyMessage}</div>
      ) : (
        <div className="space-y-1.5">
          {events.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{event.description}</div>
                <div className="truncate text-muted-foreground">{event.category}</div>
              </div>
              <div
                className={`shrink-0 font-mono font-semibold ${
                  event.type === "income" ? "text-income" : "text-expense"
                }`}
              >
                {event.type === "income" ? "+" : "-"}
                {formatCurrency(event.amount, currency, privacy)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "income" | "expense";
  icon?: typeof Wallet;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div
              className={`mt-1 font-mono text-xl ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}
            >
              {value}
            </div>
            {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
          </div>
          {Icon && (
            <Icon
              className={`h-5 w-5 ${tone === "expense" ? "text-expense" : tone === "income" ? "text-income" : "text-muted-foreground"}`}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
