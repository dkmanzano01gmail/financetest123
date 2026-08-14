import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency, formatDate, monthLabel, parseLocaleAmount } from "@/lib/format";
import {
  billingMonthForPurchase,
  invoiceMonthKey,
  isLikelyInvoicePayment,
  isPossibleDuplicatePayment,
  suggestedCardId,
} from "@/lib/credit-card-reconciliation";
import {
  CheckCircle2,
  CreditCard,
  Link2,
  Pencil,
  Plus,
  Power,
  Receipt,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cards")({ component: CardsPage });
const NOW = new Date();
const empty = () => ({
  name: "",
  institution: "",
  brand: "",
  limit_amount: "",
  closing_day: "1",
  due_day: "10",
});

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const selectedInvoiceMonth = invoiceMonthKey(year, month);

  const { data: cards = [] } = useQuery({
    queryKey: ["cards-full", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["card-reconciliation", wsId, month, year],
    enabled: !!wsId,
    queryFn: async () => {
      const rangeStart = new Date(year, month - 3, 1, 12);
      const rangeEnd = new Date(year, month + 1, 0, 12);
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id,date,description,amount,type,status,source,category_id,counterparty,credit_card_id,account_id,linked_credit_card_id,invoice_month,financial_role,reconciliation_method,reversal_of_transaction_id,categories!transactions_category_id_fkey(name,color),accounts(name)",
        )
        .eq("workspace_id", wsId!)
        .gte("date", isoDate(rangeStart))
        .lte("date", isoDate(rangeEnd))
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: paymentAllocations = [] } = useQuery({
    queryKey: ["card-payment-allocations", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_card_payment_allocations" as any)
        .select("*, original:transactions!credit_card_payment_allocations_original_transaction_id_fkey(id,date,description,amount,account_id,accounts(name))")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const analytics = useMemo(() => {
    const byCard = new Map<
      string,
      {
        spend: number;
        paid: number;
        purchases: any[];
        payments: any[];
        categories: Map<string, number>;
      }
    >();
    const nearbyInvoices = new Map<string, { count: number; total: number }>();
    for (const card of cards as any[]) {
      byCard.set(card.id, {
        spend: 0,
        paid: 0,
        purchases: [],
        payments: [],
        categories: new Map(),
      });
    }

    for (const tx of transactions as any[]) {
      if (tx.status === "ignored" || tx.status === "cancelled") continue;
      if (tx.credit_card_id) {
        const card = (cards as any[]).find((item) => item.id === tx.credit_card_id);
        if (!card) continue;
        const billingMonth =
          tx.invoice_month?.slice(0, 10) ??
          billingMonthForPurchase(tx.date, card.closing_day, card.due_day);
        if (billingMonth !== selectedInvoiceMonth) {
          const nearby = nearbyInvoices.get(billingMonth) ?? { count: 0, total: 0 };
          const value = Math.abs(Number(tx.amount || 0));
          nearby.count += 1;
          nearby.total += tx.type === "income" ? -value : value;
          nearbyInvoices.set(billingMonth, nearby);
          continue;
        }
        const item = byCard.get(card.id)!;
        const value = Math.abs(Number(tx.amount || 0));
        const signedValue = tx.type === "income" ? -value : value;
        item.spend += signedValue;
        item.purchases.push(tx);
        const category = tx.categories?.name ?? "Sem categoria";
        item.categories.set(category, (item.categories.get(category) || 0) + signedValue);
      }
      if (
        tx.financial_role === "credit_card_payment" &&
        tx.linked_credit_card_id &&
        tx.invoice_month?.slice(0, 10) === selectedInvoiceMonth
      ) {
        const item = byCard.get(tx.linked_credit_card_id);
        if (!item) continue;
        item.paid += Math.abs(Number(tx.amount || 0));
        item.payments.push(tx);
      }
    }

    for (const allocation of paymentAllocations as any[]) {
      if (allocation.invoice_month?.slice(0, 10) !== selectedInvoiceMonth) continue;
      const item = byCard.get(allocation.credit_card_id);
      if (!item) continue;
      item.paid += Math.abs(Number(allocation.allocated_amount || 0));
      item.payments.push({ ...allocation.original, allocation });
    }

    const invoiceTotals = new Map(
      [...byCard].map(([cardId, value]) => [cardId, value.spend - value.paid]),
    );
    const candidates = (transactions as any[]).filter(
      (tx) =>
        tx.date.slice(0, 7) === selectedInvoiceMonth.slice(0, 7) && isLikelyInvoicePayment(tx),
    );
    const suggestions = new Map<string, string | null>();
    const duplicates = new Set<string>();
    const exactMatches: Array<{ transaction: any; cardId: string }> = [];
    for (const candidate of candidates) {
      const duplicate = isPossibleDuplicatePayment(candidate, candidates);
      if (duplicate) duplicates.add(candidate.id);
      const cardId = suggestedCardId(candidate, cards as any[], invoiceTotals);
      suggestions.set(candidate.id, cardId);
      if (
        !duplicate &&
        cardId &&
        Math.abs((invoiceTotals.get(cardId) || 0) - Math.abs(Number(candidate.amount))) <= 0.01
      )
        exactMatches.push({ transaction: candidate, cardId });
    }

    return {
      byCard,
      candidates,
      suggestions,
      duplicates,
      exactMatches,
      nearbyInvoices,
      totalSpend: [...byCard.values()].reduce((sum, item) => sum + item.spend, 0),
      totalPaid: [...byCard.values()].reduce((sum, item) => sum + item.paid, 0),
      purchaseCount: [...byCard.values()].reduce((sum, item) => sum + item.purchases.length, 0),
    };
  }, [cards, transactions, paymentAllocations, selectedInvoiceMonth]);

  const invalidateFinancialViews = () => {
    qc.invalidateQueries({ queryKey: ["card-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-dashboard-period"] });
    qc.invalidateQueries({ queryKey: ["ba-txs"] });
    qc.invalidateQueries({ queryKey: ["reconciliation"] });
    qc.invalidateQueries({ queryKey: ["card-payment-allocations"] });
  };

  const allocatePayments = useMutation({
    mutationFn: async () => {
      if (!selectedCardId) throw new Error("Selecione o cartão.");
      const selected = analytics.candidates
        .map((transaction: any) => ({ transaction, amount: parseLocaleAmount(allocations[transaction.id]) }))
        .filter(({ amount }) => Number.isFinite(amount) && amount > 0);
      if (!selected.length) throw new Error("Informe quanto deseja abater em pelo menos uma conta.");

      const cardData = analytics.byCard.get(selectedCardId);
      const invoicePending = Math.max((cardData?.spend || 0) - (cardData?.paid || 0), 0);
      const requested = selected.reduce((sum, item) => sum + item.amount, 0);
      if (requested > invoicePending + 0.005)
        throw new Error(`O total escolhido excede o saldo pendente da fatura (${formatCurrency(invoicePending, currency)}).`);

      for (const { transaction, amount } of selected) {
        const used = (paymentAllocations as any[])
          .filter((item) => item.original_transaction_id === transaction.id)
          .reduce((sum, item) => sum + Math.abs(Number(item.allocated_amount) || 0), 0);
        const available = Math.max(Math.abs(Number(transaction.amount)) - used, 0);
        if (amount > available + 0.005)
          throw new Error(`O valor de “${transaction.description}” excede o disponível (${formatCurrency(available, currency)}).`);
      }

      const { error } = await (supabase.rpc as any)("allocate_card_payments", {
        target_credit_card_id: selectedCardId,
        target_invoice_month: selectedInvoiceMonth,
        allocation_items: selected.map(({ transaction, amount }) => ({
          transaction_id: transaction.id,
          amount,
        })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinancialViews();
      setPaymentOpen(false);
      setAllocations({});
      toast.success("Abatimento criado sem apagar as transações originais");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const undoReconciliation = useMutation({
    mutationFn: async (allocationId: string) => {
      const { error } = await (supabase.rpc as any)("undo_card_payment_allocation", {
        target_allocation_id: allocationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinancialViews();
      toast.success("Conciliação desfeita");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do cartão.");
      const limit = form.limit_amount.trim() ? parseLocaleAmount(form.limit_amount) : 0;
      const closingDay = Number(form.closing_day);
      const dueDay = Number(form.due_day);
      if (!Number.isFinite(limit)) throw new Error("Limite inválido.");
      if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31)
        throw new Error("Dia de fechamento inválido.");
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
        throw new Error("Dia de vencimento inválido.");
      const payload = {
        workspace_id: wsId!,
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        brand: form.brand.trim() || null,
        limit_amount: limit,
        closing_day: closingDay,
        due_day: dueDay,
      };
      const { error } = editId
        ? await supabase
            .from("credit_cards")
            .update(payload)
            .eq("id", editId)
            .eq("workspace_id", wsId!)
        : await supabase.from("credit_cards").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards-full"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      setOpen(false);
      setEditId(null);
      setForm(empty());
      toast.success("Cartão salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("credit_cards")
        .update({ is_active })
        .eq("id", id)
        .eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards-full"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(card: any) {
    setEditId(card.id);
    setForm({
      name: card.name,
      institution: card.institution ?? "",
      brand: card.brand ?? "",
      limit_amount: String(card.limit_amount ?? 0),
      closing_day: String(card.closing_day ?? 1),
      due_day: String(card.due_day ?? 10),
    });
    setOpen(true);
  }

  function openPayment(transaction?: any) {
    const cardId =
      (transaction ? analytics.suggestions.get(transaction.id) : null) ||
      (cards[0] as any)?.id ||
      "";
    setSelectedCardId(cardId);
    const cardData = analytics.byCard.get(cardId);
    const invoicePending = Math.max((cardData?.spend || 0) - (cardData?.paid || 0), 0);
    setAllocations(
      transaction
        ? {
            [transaction.id]: String(
              Math.min(Math.abs(Number(transaction.amount)), invoicePending),
            ),
          }
        : {},
    );
    setPaymentOpen(true);
  }

  function paymentAvailable(transaction: any) {
    const used = (paymentAllocations as any[])
      .filter((item) => item.original_transaction_id === transaction.id)
      .reduce((sum, item) => sum + Math.abs(Number(item.allocated_amount) || 0), 0);
    return Math.max(Math.abs(Number(transaction.amount)) - used, 0);
  }

  const totalDifference = analytics.totalSpend - analytics.totalPaid;
  const nextInvoiceDate = new Date(year, month, 1, 12);
  const nextInvoiceMonth = invoiceMonthKey(
    nextInvoiceDate.getFullYear(),
    nextInvoiceDate.getMonth() + 1,
  );
  const nextInvoicePurchases = analytics.nearbyInvoices.get(nextInvoiceMonth);

  return (
    <PageContainer>
      <PageHeader
        title="Cartões"
        description="Faturas, gastos detalhados e pagamentos sem dupla contagem"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setForm(empty());
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo cartão
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <span className="mr-1 text-sm font-medium">Fatura de</span>
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
              {[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {analytics.exactMatches.length > 0 && (
            <Badge className="ml-auto bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {analytics.exactMatches.length} valor
              {analytics.exactMatches.length > 1 ? "es conferem" : " confere"}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Compras da fatura"
          value={formatCurrency(analytics.totalSpend, currency, privacy)}
          tone="expense"
        />
        <Stat
          label="Pagamentos conciliados"
          value={formatCurrency(analytics.totalPaid, currency, privacy)}
        />
        <Stat
          label="Falta conciliar"
          value={formatCurrency(totalDifference, currency, privacy)}
          tone={totalDifference > 0.01 ? "expense" : undefined}
        />
        <Stat label="Compras detalhadas" value={String(analytics.purchaseCount)} />
      </div>

      {analytics.purchaseCount === 0 && nextInvoicePurchases && nextInvoicePurchases.count > 0 && (
        <Card className="mb-4 border-sky-200 bg-sky-50/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex-1 text-sm text-sky-950">
              Encontramos <strong>{nextInvoicePurchases.count} compras</strong>, somando{" "}
              <strong>{formatCurrency(nextInvoicePurchases.total, currency, privacy)}</strong>. Pelas
              datas de fechamento cadastradas, elas pertencem à fatura de{" "}
              <strong>{monthLabel(nextInvoiceDate.getMonth() + 1)} de {nextInvoiceDate.getFullYear()}</strong>.
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setMonth(nextInvoiceDate.getMonth() + 1);
                setYear(nextInvoiceDate.getFullYear());
              }}
            >
              Ver fatura de {monthLabel(nextInvoiceDate.getMonth() + 1)}
            </Button>
          </CardContent>
        </Card>
      )}

      {analytics.candidates.length > 0 && (
        <Card className="mb-4 border-amber-300/70 bg-amber-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <CardTitle className="text-base">Pagamentos encontrados nas transações</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha uma ou mais contas e quanto abater de cada pagamento. O original será
                  preservado e uma compensação inversa cancelará a duplicidade nos totais. Nenhum
                  pagamento será apagado.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {analytics.candidates.map((transaction: any) => {
              const cardId = analytics.suggestions.get(transaction.id);
              const card = (cards as any[]).find((item) => item.id === cardId);
              const duplicate = analytics.duplicates.has(transaction.id);
              const exact = analytics.exactMatches.some(
                (item) => item.transaction.id === transaction.id,
              );
              return (
                <div
                  key={transaction.id}
                  className="flex flex-col gap-3 rounded-lg border bg-background p-3 md:flex-row md:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{transaction.description}</span>
                      {exact && (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Valor confere
                        </Badge>
                      )}
                      {duplicate && (
                        <Badge variant="destructive">
                          <ShieldAlert className="mr-1 h-3 w-3" />
                          Possível duplicata
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDate(transaction.date)} ·{" "}
                      {transaction.accounts?.name ?? "Conta não identificada"}
                      {card ? ` · sugestão: ${card.name}` : " · escolha o cartão"}
                    </div>
                    {duplicate && (
                      <div className="mt-1 text-xs text-amber-800">
                        Há outro pagamento de mesmo valor em até dois dias. Revise antes de
                        conciliar.
                      </div>
                    )}
                  </div>
                  <div className="font-mono text-lg font-semibold">
                    {formatCurrency(Math.abs(Number(transaction.amount)), currency, privacy)}
                    {paymentAvailable(transaction) < Math.abs(Number(transaction.amount)) && (
                      <div className="text-xs font-sans font-normal text-muted-foreground">
                        Disponível: {formatCurrency(paymentAvailable(transaction), currency, privacy)}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={exact ? "default" : "outline"}
                    disabled={paymentAvailable(transaction) <= 0.005}
                    onClick={() => openPayment(transaction)}
                  >
                    {paymentAvailable(transaction) <= 0.005
                      ? "Totalmente abatido"
                      : exact
                        ? "Criar compensação"
                        : "Escolher valores"}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {cards.length === 0 ? (
        <EmptyState icon={CreditCard} title="Nenhum cartão cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {(cards as any[]).map((card) => {
            const data = analytics.byCard.get(card.id)!;
            const difference = data.spend - data.paid;
            const reconciled = data.spend > 0 && Math.abs(difference) <= 0.01;
            const available = Number(card.limit_amount || 0) - data.spend;
            const topCategory = [...data.categories].sort((a, b) => b[1] - a[1])[0];
            return (
              <Card key={card.id} className={card.is_active ? "" : "opacity-60"}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{card.name}</CardTitle>
                        <Badge
                          variant={reconciled ? "default" : "outline"}
                          className={reconciled ? "bg-emerald-700" : ""}
                        >
                          {reconciled
                            ? "Fatura conciliada"
                            : data.paid > 0
                              ? "Conciliação parcial"
                              : "Pendente"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {card.institution ?? "—"} {card.brand ? `· ${card.brand}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => edit(card)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggle.mutate({ id: card.id, is_active: !card.is_active })}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/35 p-3 md:grid-cols-3">
                    <Info
                      label="Compras da fatura"
                      value={formatCurrency(data.spend, currency, privacy)}
                      tone="expense"
                    />
                    <Info
                      label="Pagamentos"
                      value={formatCurrency(data.paid, currency, privacy)}
                      tone={data.paid ? "income" : undefined}
                    />
                    <Info
                      label={difference >= 0 ? "Falta conciliar" : "Pago a maior"}
                      value={formatCurrency(Math.abs(difference), currency, privacy)}
                      tone={Math.abs(difference) <= 0.01 ? "income" : "expense"}
                    />
                    <Info
                      label="Limite disponível"
                      value={formatCurrency(available, currency, privacy)}
                      tone={available < 0 ? "expense" : "income"}
                    />
                    <Info
                      label="Limite"
                      value={formatCurrency(Number(card.limit_amount), currency, privacy)}
                    />
                    <Info
                      label="Maior categoria"
                      value={
                        topCategory
                          ? `${topCategory[0]} · ${formatCurrency(topCategory[1], currency, privacy)}`
                          : "—"
                      }
                    />
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Fecha dia {card.closing_day} · vence dia {card.due_day}
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Compras detalhadas
                    </div>
                    <div className="space-y-2">
                      {data.purchases.slice(0, 5).map((transaction: any) => (
                        <div
                          key={transaction.id}
                          className="flex items-center gap-2 border-t pt-2 text-sm"
                        >
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{transaction.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(transaction.date)} ·{" "}
                              {transaction.categories?.name ?? "Sem categoria"}
                            </div>
                          </div>
                          <div
                            className={`font-mono ${transaction.type === "income" ? "text-income" : "text-expense"}`}
                          >
                            {transaction.type === "income" ? "+" : "-"}
                            {formatCurrency(
                              Math.abs(Number(transaction.amount)),
                              currency,
                              privacy,
                            )}
                          </div>
                        </div>
                      ))}
                      {!data.purchases.length && (
                        <div className="text-sm text-muted-foreground">
                          Importe ou vincule as compras deste cartão para formar a fatura.
                        </div>
                      )}
                    </div>
                  </div>

                  {data.payments.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Pagamentos conciliados
                      </div>
                      <div className="space-y-2">
                        {data.payments.map((payment: any) => (
                          <div
                            key={payment.allocation?.id ?? payment.id}
                            className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2 text-sm"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{payment.description}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(payment.date)} · {payment.accounts?.name ?? "Conta"} ·
                                original preservado
                              </div>
                            </div>
                            <div className="font-mono font-medium">
                              {formatCurrency(
                                Math.abs(Number(payment.allocation?.allocated_amount ?? payment.amount)),
                                currency,
                                privacy,
                              )}
                            </div>
                            {payment.allocation?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Desfazer abatimento e remover a compensação"
                                onClick={() => undoReconciliation.mutate(payment.allocation.id)}
                              >
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(paymentAllocations as any[]).some(
                    (allocation) =>
                      allocation.credit_card_id === card.id &&
                      allocation.invoice_month?.slice(0, 10) === selectedInvoiceMonth,
                  ) && (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-950">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Pagamento original preservado com compensação auditável
                      </div>
                      <p className="mt-1 text-xs text-emerald-800">
                        O valor abatido foi registrado em uma nova transação inversa. Assim, o
                        extrato continua íntegro e o pagamento não duplica as despesas.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Escolher contas e valores para abater</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Cartão pago">
              <Select
                value={selectedCardId}
                onValueChange={(value) => {
                  setSelectedCardId(value);
                  setAllocations({});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {(cards as any[]).map((card) => (
                    <SelectItem key={card.id} value={card.id}>
                      {card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-lg border bg-muted/25 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Saldo pendente da fatura</span>
                <strong className="font-mono">
                  {formatCurrency(
                    Math.max(
                      (analytics.byCard.get(selectedCardId)?.spend || 0) -
                        (analytics.byCard.get(selectedCardId)?.paid || 0),
                      0,
                    ),
                    currency,
                    privacy,
                  )}
                </strong>
              </div>
              <div className="mt-1 flex justify-between gap-3">
                <span className="text-muted-foreground">Total escolhido</span>
                <strong className="font-mono">
                  {formatCurrency(
                    analytics.candidates.reduce((sum: number, transaction: any) => {
                      const amount = parseLocaleAmount(allocations[transaction.id]);
                      return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
                    }, 0),
                    currency,
                    privacy,
                  )}
                </strong>
              </div>
            </div>
            <div className="max-h-[45vh] space-y-2 overflow-auto pr-1">
              {analytics.candidates.map((transaction: any) => {
                const available = paymentAvailable(transaction);
                return (
                  <div
                    key={transaction.id}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_180px] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{transaction.description}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDate(transaction.date)} · {transaction.accounts?.name ?? "Conta"} ·
                        disponível {formatCurrency(available, currency, privacy)}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`allocation-${transaction.id}`} className="text-xs">
                        Quanto abater
                      </Label>
                      <Input
                        id={`allocation-${transaction.id}`}
                        inputMode="decimal"
                        placeholder="0,00"
                        disabled={available <= 0.005}
                        value={allocations[transaction.id] ?? ""}
                        onChange={(event) =>
                          setAllocations((current) => ({
                            ...current,
                            [transaction.id]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-sm text-muted-foreground">
              Para cada valor será criada uma transação de entrada com sinal inverso, na mesma
              conta e categoria do pagamento. Ela neutraliza a despesa nos relatórios, enquanto o
              pagamento bancário original permanece intacto e continua no Fluxo de Caixa.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!selectedCardId || allocatePayments.isPending}
              onClick={() => allocatePayments.mutate()}
            >
              Criar compensações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Nome">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Instituição">
                <Input
                  value={form.institution}
                  onChange={(event) => setForm({ ...form, institution: event.target.value })}
                />
              </Field>
              <Field label="Bandeira">
                <Input
                  value={form.brand}
                  onChange={(event) => setForm({ ...form, brand: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Limite">
              <Input
                inputMode="decimal"
                value={form.limit_amount}
                onChange={(event) => setForm({ ...form, limit_amount: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fechamento">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.closing_day}
                  onChange={(event) => setForm({ ...form, closing_day: event.target.value })}
                />
              </Field>
              <Field label="Vencimento">
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(event) => setForm({ ...form, due_day: event.target.value })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "expense" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 font-mono text-xl ${tone === "expense" ? "text-expense" : ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Info({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense";
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-sm font-medium ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
