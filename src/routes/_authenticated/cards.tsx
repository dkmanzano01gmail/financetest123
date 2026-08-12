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
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [selectedCardId, setSelectedCardId] = useState("");
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
          "id,date,description,amount,type,status,source,credit_card_id,account_id,linked_credit_card_id,invoice_month,financial_role,reconciliation_method,categories(name,color),accounts(name)",
        )
        .eq("workspace_id", wsId!)
        .gte("date", isoDate(rangeStart))
        .lte("date", isoDate(rangeEnd))
        .order("date", { ascending: false });
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
  }, [cards, transactions, selectedInvoiceMonth]);

  const invalidateFinancialViews = () => {
    qc.invalidateQueries({ queryKey: ["card-reconciliation"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-dashboard-period"] });
    qc.invalidateQueries({ queryKey: ["ba-txs"] });
    qc.invalidateQueries({ queryKey: ["reconciliation"] });
  };

  const reconcile = useMutation({
    mutationFn: async ({
      transactionId,
      cardId,
      method,
    }: {
      transactionId: string;
      cardId: string;
      method: "manual" | "exact_match";
    }) => {
      const { data, error } = await supabase
        .from("transactions")
        .update({
          financial_role: "credit_card_payment",
          linked_credit_card_id: cardId,
          invoice_month: selectedInvoiceMonth,
          reconciliation_method: method,
          reconciled_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .eq("workspace_id", wsId!)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("O pagamento não foi atualizado.");
    },
    onSuccess: () => {
      invalidateFinancialViews();
      setPaymentOpen(false);
      setSelectedPayment(null);
      toast.success("Pagamento conciliado com a fatura");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconcileExact = useMutation({
    mutationFn: async () => {
      for (const match of analytics.exactMatches) {
        const { error } = await supabase
          .from("transactions")
          .update({
            financial_role: "credit_card_payment",
            linked_credit_card_id: match.cardId,
            invoice_month: selectedInvoiceMonth,
            reconciliation_method: "exact_match",
            reconciled_at: new Date().toISOString(),
          })
          .eq("id", match.transaction.id)
          .eq("workspace_id", wsId!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateFinancialViews();
      toast.success(
        `${analytics.exactMatches.length} ${analytics.exactMatches.length === 1 ? "pagamento conciliado" : "pagamentos conciliados"}`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const undoReconciliation = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from("transactions")
        .update({
          financial_role: "regular",
          linked_credit_card_id: null,
          invoice_month: null,
          reconciliation_method: null,
          reconciled_at: null,
          reconciled_by: null,
        })
        .eq("id", transactionId)
        .eq("workspace_id", wsId!);
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

  function openPayment(transaction: any) {
    setSelectedPayment(transaction);
    setSelectedCardId(analytics.suggestions.get(transaction.id) || (cards[0] as any)?.id || "");
    setPaymentOpen(true);
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
            <Button
              className="ml-auto"
              onClick={() => reconcileExact.mutate()}
              disabled={reconcileExact.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Conciliar {analytics.exactMatches.length} correspondência
              {analytics.exactMatches.length > 1 ? "s" : ""}
            </Button>
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
                  Vincule cada pagamento ao cartão correto. Ele continuará no fluxo da conta, mas
                  deixará de duplicar as despesas.
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
                  </div>
                  <Button
                    variant={exact ? "default" : "outline"}
                    onClick={() =>
                      exact && cardId
                        ? reconcile.mutate({
                            transactionId: transaction.id,
                            cardId,
                            method: "exact_match",
                          })
                        : openPayment(transaction)
                    }
                  >
                    {exact ? "Conciliar agora" : "Escolher cartão"}
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
                            key={payment.id}
                            className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2 text-sm"
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{payment.description}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatDate(payment.date)} · {payment.accounts?.name ?? "Conta"}
                              </div>
                            </div>
                            <div className="font-mono font-medium">
                              {formatCurrency(Math.abs(Number(payment.amount)), currency, privacy)}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Desfazer conciliação"
                              onClick={() => undoReconciliation.mutate(payment.id)}
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conciliar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="font-medium">{selectedPayment?.description}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {selectedPayment
                  ? `${formatDate(selectedPayment.date)} · ${formatCurrency(Math.abs(Number(selectedPayment.amount)), currency, privacy)}`
                  : ""}
              </div>
            </div>
            <Field label="Cartão pago">
              <Select value={selectedCardId} onValueChange={setSelectedCardId}>
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
            <div className="text-sm text-muted-foreground">
              O pagamento será associado à fatura de {monthLabel(month)} de {year}. Ele continuará
              reduzindo o saldo da conta corrente e não será somado novamente às despesas.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!selectedPayment || !selectedCardId || reconcile.isPending}
              onClick={() =>
                reconcile.mutate({
                  transactionId: selectedPayment.id,
                  cardId: selectedCardId,
                  method: "manual",
                })
              }
            >
              Confirmar conciliação
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
