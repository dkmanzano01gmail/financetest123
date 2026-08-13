import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { useCustomizedUI } from "@/hooks/use-customized-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { TransactionDialog } from "@/components/app/transaction-dialog";
import { SuggestReviewDialog } from "@/components/app/suggest-review-dialog";
import { Badge } from "@/components/ui/badge";
import { labelImp, importanceBadgeClass, type Importance } from "@/lib/suggestions";
import { formatCurrency, formatDate, monthLabel } from "@/lib/format";
import { L } from "@/lib/labels";
import {
  matchesTransactionSource,
  summarizeTransactionsByCategory,
  transactionCategoryKey,
  type TransactionSourceFilter,
} from "@/lib/transaction-summary";
import {
  analyticalTransactionType,
  isConsumptionTransaction,
  isCreditCardPayment,
  isCreditCardPaymentOffset,
  netCardPaymentOffsets,
} from "@/lib/credit-card-reconciliation";
import { Plus, Receipt, Trash2, Sparkles, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type TransactionSearch = {
  month?: string;
  year?: string;
  type?: "income" | "expense";
  category?: string;
};

export const Route = createFileRoute("/_authenticated/transactions")({
  validateSearch: (search: Record<string, unknown>): TransactionSearch => ({
    month:
      typeof search.month === "string" && /^(?:[1-9]|1[0-2])$/.test(search.month)
        ? search.month
        : undefined,
    year: typeof search.year === "string" && /^\d{4}$/.test(search.year) ? search.year : undefined,
    type: search.type === "income" || search.type === "expense" ? search.type : undefined,
    category: typeof search.category === "string" ? search.category.slice(0, 120) : undefined,
  }),
  component: TransactionsPage,
});

const NOW = new Date();

function normalizeCategoryName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/s$/, "");
}

function analyticalTransactionCategoryKey(transaction: any) {
  const key = transactionCategoryKey(transaction);
  return isCreditCardPaymentOffset(transaction) ? key.replace(/^income:/, "expense:") : key;
}

function TransactionsPage() {
  const routeSearch = Route.useSearch();
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>(routeSearch.month ?? "all");
  const [year, setYear] = useState<string>(routeSearch.year ?? "all");
  const [type, setType] = useState<string>(routeSearch.type ?? "all");
  const [source, setSource] = useState<TransactionSourceFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [requestedCategory, setRequestedCategory] = useState(routeSearch.category ?? null);
  const [open, setOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const wsId = workspace?.id;
  const { savedFilters } = useCustomizedUI(wsId);
  const t = workspace ? L(workspace.type) : L("personal");
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;

  const {
    data: txs,
    error: txsError,
    isLoading: txsLoading,
  } = useQuery({
    queryKey: ["transactions", wsId, year, month],
    enabled: !!wsId,
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, categories!transactions_category_id_fkey(name,color), accounts(name)")
        .eq("workspace_id", wsId!)
        .order("date", { ascending: false });
      if (year !== "all") q = q.eq("year", Number(year));
      if (month !== "all") q = q.eq("month", Number(month));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // `transactions` has two foreign keys to `credit_cards`. Fetching card names
  // separately avoids PostgREST trying to infer which relationship to embed.
  const { data: transactionCards } = useQuery({
    queryKey: ["credit-cards", "transaction-names", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("id,name")
        .eq("workspace_id", wsId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const transactionCardNames = useMemo(
    () => new Map((transactionCards ?? []).map((card) => [card.id, card.name])),
    [transactionCards],
  );

  const { data: categories } = useQuery({
    queryKey: ["categories", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filterableTransactions = useMemo(() => {
    return (txs ?? []).filter((tx) => {
      if (type !== "all" && analyticalTransactionType(tx) !== type) return false;
      if (!matchesTransactionSource(tx, source)) return false;
      if (search && !tx.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [txs, type, source, search]);

  const categorySummary = useMemo(
    () =>
      summarizeTransactionsByCategory(
        netCardPaymentOffsets(filterableTransactions).filter(isConsumptionTransaction),
      ),
    [filterableTransactions],
  );

  useEffect(() => {
    if (!requestedCategory || !categorySummary.length) return;
    const requested = normalizeCategoryName(requestedCategory);
    const match = categorySummary.find(
      (category) => normalizeCategoryName(category.name) === requested,
    );
    if (match) {
      setSelectedCategoryKey(match.key);
      setRequestedCategory(null);
    }
  }, [categorySummary, requestedCategory]);

  const filtered = useMemo(() => {
    if (selectedCategoryKey) {
      return filterableTransactions.filter(
        (transaction) => analyticalTransactionCategoryKey(transaction) === selectedCategoryKey,
      );
    }
    if (requestedCategory) {
      const requested = normalizeCategoryName(requestedCategory);
      return filterableTransactions.filter(
        (transaction) =>
          normalizeCategoryName(transaction.categories?.name || "Sem categoria") === requested,
      );
    }
    return filterableTransactions;
  }, [filterableTransactions, requestedCategory, selectedCategoryKey]);

  const protectedAllocationTransactionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const transaction of txs ?? []) {
      if (!isCreditCardPaymentOffset(transaction)) continue;
      ids.add(transaction.id);
      if (transaction.reversal_of_transaction_id) {
        ids.add(transaction.reversal_of_transaction_id);
      }
    }
    return ids;
  }, [txs]);

  const hasCategoryFilter = Boolean(selectedCategoryKey || requestedCategory);

  function clearCategorySelection() {
    setSelectedCategoryKey(null);
    setRequestedCategory(null);
  }

  const filteredTotals = useMemo(
    () =>
      netCardPaymentOffsets(filtered).filter(isConsumptionTransaction).reduce(
        (totals, transaction) => {
          totals[transaction.type as "income" | "expense"] += Math.abs(
            Number(transaction.amount) || 0,
          );
          return totals;
        },
        { income: 0, expense: 0 },
      ),
    [filtered],
  );

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["ba-txs"] });
      toast.success("Removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCat = useMutation({
    mutationFn: async ({ id, category_id }: { id: string; category_id: string | null }) => {
      const { error } = await supabase
        .from("transactions")
        .update({ category_id } as any)
        .eq("id", id)
        .eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Transações"
        description={`Histórico de ${workspace?.name ?? ""}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setSuggestOpen(true)}
              disabled={!filtered.length}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Sugerir categorias
            </Button>
            <Button
              onClick={() => {
                setEditingTx(null);
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Nova transação
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar descrição..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              clearCategorySelection();
            }}
            className="max-w-xs"
          />
          <Select
            value={month}
            onValueChange={(value) => {
              setMonth(value);
              clearCategorySelection();
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo mês</SelectItem>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {monthLabel(i + 1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={year}
            onValueChange={(value) => {
              setYear(value);
              clearCategorySelection();
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(value) => {
              setType(value);
              clearCategorySelection();
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">{t.incomeSingular}</SelectItem>
              <SelectItem value="expense">{t.expenseSingular}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value as TransactionSourceFilter);
              clearCategorySelection();
            }}
          >
            <SelectTrigger className="w-48" aria-label="Filtrar por conta ou cartão">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Conta e cartão</SelectItem>
              <SelectItem value="account">Conta corrente</SelectItem>
              <SelectItem value="credit_card">Cartão de crédito</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {savedFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtros salvos:</span>
          {savedFilters.map((f: any) => (
            <button
              key={f.id}
              onClick={() => {
                const fc = f.configuration_json?.filters ?? {};
                if (typeof fc.search === "string") setSearch(fc.search);
                if (fc.type) setType(String(fc.type));
                if (fc.month) setMonth(String(fc.month));
                if (fc.year) setYear(String(fc.year));
                clearCategorySelection();
                toast.success(`Filtro "${f.name}" aplicado`);
              }}
              className="text-xs px-2.5 py-1 rounded-full border bg-card hover:bg-accent transition"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {(categorySummary.length > 0 || hasCategoryFilter) && (
        <section className="mb-4" aria-labelledby="category-summary-title">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="category-summary-title" className="text-base font-semibold">
                Resumo por categoria
              </h2>
              <p className="text-xs text-muted-foreground">
                Clique em uma categoria para filtrar as transações
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground">
                {hasCategoryFilter
                  ? `${filtered.length} de ${filterableTransactions.length} transações`
                  : `${filtered.length} ${filtered.length === 1 ? "transação" : "transações"}`}
              </div>
              {hasCategoryFilter && (
                <Button variant="ghost" size="sm" onClick={clearCategorySelection}>
                  Mostrar todas
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {categorySummary.map((category) => (
              <button
                key={category.key}
                type="button"
                aria-pressed={selectedCategoryKey === category.key}
                aria-label={`Filtrar por ${category.name}`}
                onClick={() => {
                  setRequestedCategory(null);
                  setSelectedCategoryKey((current) =>
                    current === category.key ? null : category.key,
                  );
                }}
                className={`overflow-hidden rounded-xl border bg-card/80 text-left text-card-foreground shadow transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selectedCategoryKey === category.key
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : ""
                }`}
              >
                <CardContent className="relative p-4">
                  <div
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{category.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {category.count} {category.count === 1 ? "transação" : "transações"}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-right font-mono font-semibold ${
                        category.type === "income" ? "text-income" : "text-expense"
                      }`}
                    >
                      {category.type === "expense" ? "-" : ""}
                      {formatCurrency(category.value, currency, privacy)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatCurrency(category.value, currency, privacy)} em{" "}
                    {(category.type === "income" ? t.income : t.expense).toLowerCase()}
                  </div>
                </CardContent>
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t.income}:{" "}
              <strong className="font-mono text-income">
                {formatCurrency(filteredTotals.income, currency, privacy)}
              </strong>
            </span>
            <span>
              {t.expense}:{" "}
              <strong className="font-mono text-expense">
                {formatCurrency(filteredTotals.expense, currency, privacy)}
              </strong>
            </span>
          </div>
        </section>
      )}

      <Card>
        <CardContent className="p-0">
          {txsError ? (
            <div className="p-6 text-sm text-destructive">
              Erro ao carregar transações: {(txsError as any).message}
            </div>
          ) : txsLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title="Você ainda não cadastrou transações"
                description="Crie uma transação manualmente para começar."
                action={
                  <Button
                    onClick={() => {
                      setEditingTx(null);
                      setOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Nova transação
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Importância</TableHead>
                  <TableHead>Conta/Cartão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      <div>{formatDate(tx.date)}</div>
                      {tx.credit_card_id && tx.invoice_month && (
                        <div className="text-xs">
                          Fatura {monthLabel(Number(tx.invoice_month.slice(5, 7))).toLowerCase()}/
                          {tx.invoice_month.slice(0, 4)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{tx.description}</div>
                      {tx.counterparty && (
                        <div className="text-xs text-muted-foreground">{tx.counterparty}</div>
                      )}
                      {isCreditCardPayment(tx) && (
                        <Badge variant="outline" className="mt-1">
                          Pagamento de fatura · não soma nas despesas
                        </Badge>
                      )}
                      {isCreditCardPaymentOffset(tx) && (
                        <Badge variant="outline" className="mt-1 border-emerald-300 text-emerald-800">
                          Compensação de pagamento · original preservado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={tx.category_id ?? ""}
                        disabled={protectedAllocationTransactionIds.has(tx.id)}
                        onValueChange={(v) =>
                          updateCat.mutate({ id: tx.id, category_id: v || null })
                        }
                      >
                        <SelectTrigger className="h-8 w-44 border-transparent hover:border-border bg-transparent">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {(categories ?? [])
                            .filter((c: any) => c.type === analyticalTransactionType(tx))
                            .map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {tx.importance_level ? (
                        <Badge
                          variant="secondary"
                          className={importanceBadgeClass(tx.importance_level as Importance)}
                        >
                          {labelImp(tx.importance_level as Importance)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.accounts?.name ??
                        transactionCardNames.get(tx.credit_card_id) ??
                        transactionCardNames.get(tx.linked_credit_card_id) ??
                        "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${isCreditCardPaymentOffset(tx) || tx.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]"}`}
                    >
                      {isCreditCardPaymentOffset(tx) ? "+" : tx.type === "income" ? "+" : "-"}
                      {formatCurrency(Number(tx.amount), currency, privacy)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={
                            protectedAllocationTransactionIds.has(tx.id)
                              ? "Desfaça o abatimento na aba Cartões para editar"
                              : "Editar"
                          }
                          disabled={protectedAllocationTransactionIds.has(tx.id)}
                          onClick={() => {
                            setEditingTx(tx);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={
                            protectedAllocationTransactionIds.has(tx.id)
                              ? "Desfaça o abatimento na aba Cartões para remover"
                              : "Remover"
                          }
                          disabled={protectedAllocationTransactionIds.has(tx.id)}
                          onClick={() => setDeleteId(tx.id)}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TransactionDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditingTx(null);
        }}
        transaction={editingTx}
      />
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover transação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) removeMut.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {wsId && workspace && (
        <SuggestReviewDialog
          open={suggestOpen}
          onOpenChange={setSuggestOpen}
          workspaceId={wsId}
          workspaceType={workspace.type}
          transactions={
            filtered
              .filter((tx: any) => !protectedAllocationTransactionIds.has(tx.id))
              .map((tx: any) => ({
                id: tx.id,
                date: tx.date,
                description: tx.description,
                counterparty: tx.counterparty,
                type: tx.type,
                amount: Number(tx.amount),
                category_id: tx.category_id,
                importance_level: tx.importance_level,
                importance_confirmed_by_user: tx.importance_confirmed_by_user,
                current_category_name: tx.categories?.name ?? null,
              })) as any
          }
        />
      )}
    </PageContainer>
  );
}
