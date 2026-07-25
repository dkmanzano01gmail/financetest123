import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { useCustomizedUI } from "@/hooks/use-customized-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { TransactionDialog } from "@/components/app/transaction-dialog";
import { SuggestReviewDialog } from "@/components/app/suggest-review-dialog";
import { Badge } from "@/components/ui/badge";
import { labelImp, importanceBadgeClass, type Importance } from "@/lib/suggestions";
import { formatCurrency, formatDate, monthLabel } from "@/lib/format";
import { L } from "@/lib/labels";
import { Plus, Receipt, Trash2, Sparkles, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

const NOW = new Date();

function TransactionsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [month, setMonth] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const wsId = workspace?.id;
  const { savedFilters } = useCustomizedUI(wsId);
  const t = workspace ? L(workspace.type) : L("personal");
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;

  const { data: txs, error: txsError, isLoading: txsLoading } = useQuery({
    queryKey: ["transactions", wsId, year, month],
    enabled: !!wsId,
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, categories!transactions_category_id_fkey(name,color), accounts(name), credit_cards(name)")
        .eq("workspace_id", wsId!)
        .order("date", { ascending: false });
      if (year !== "all") q = q.eq("year", Number(year));
      if (month !== "all") q = q.eq("month", Number(month));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["categories", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").eq("workspace_id", wsId!).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return (txs ?? []).filter((tx: any) => {
      if (type !== "all" && tx.type !== type) return false;
      if (search && !tx.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [txs, type, search]);

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id).eq("workspace_id", wsId!);
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
      const { error } = await supabase.from("transactions")
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
            <Button variant="outline" onClick={() => setSuggestOpen(true)} disabled={!filtered.length}>
              <Sparkles className="w-4 h-4 mr-1" />Sugerir categorias
            </Button>
            <Button onClick={() => { setEditingTx(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />Nova transação</Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <Input placeholder="Buscar descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo mês</SelectItem>
              {Array.from({ length: 12 }).map((_, i) => <SelectItem key={i+1} value={String(i+1)}>{monthLabel(i+1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {[NOW.getFullYear()-1, NOW.getFullYear(), NOW.getFullYear()+1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">{t.incomeSingular}</SelectItem>
              <SelectItem value="expense">{t.expenseSingular}</SelectItem>
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
                toast.success(`Filtro "${f.name}" aplicado`);
              }}
              className="text-xs px-2.5 py-1 rounded-full border bg-card hover:bg-accent transition"
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {txsError ? (
            <div className="p-6 text-sm text-destructive">Erro ao carregar transações: {(txsError as any).message}</div>
          ) : txsLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title="Você ainda não cadastrou transações"
                description="Crie uma transação manualmente para começar."
                action={<Button onClick={() => { setEditingTx(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" />Nova transação</Button>}
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
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{tx.description}</div>
                      {tx.counterparty && <div className="text-xs text-muted-foreground">{tx.counterparty}</div>}
                    </TableCell>
                    <TableCell>
                      <Select value={tx.category_id ?? ""} onValueChange={(v) => updateCat.mutate({ id: tx.id, category_id: v || null })}>
                        <SelectTrigger className="h-8 w-44 border-transparent hover:border-border bg-transparent">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {(categories ?? []).filter((c: any) => c.type === tx.type).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {tx.importance_level ? (
                        <Badge variant="secondary" className={importanceBadgeClass(tx.importance_level as Importance)}>
                          {labelImp(tx.importance_level as Importance)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tx.accounts?.name ?? tx.credit_cards?.name ?? "—"}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${tx.type === "income" ? "text-[var(--income)]" : "text-[var(--expense)]"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(Number(tx.amount), currency, privacy)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => { setEditingTx(tx); setOpen(true); }}>
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Remover" onClick={() => setDeleteId(tx.id)}>
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

      <TransactionDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingTx(null); }} transaction={editingTx} />
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover transação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) removeMut.mutate(deleteId); setDeleteId(null); }}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {wsId && workspace && (
        <SuggestReviewDialog
          open={suggestOpen}
          onOpenChange={setSuggestOpen}
          workspaceId={wsId}
          workspaceType={workspace.type}
          transactions={filtered.map((tx: any) => ({
            id: tx.id,
            description: tx.description,
            counterparty: tx.counterparty,
            type: tx.type,
            amount: Number(tx.amount),
            category_id: tx.category_id,
            importance_level: tx.importance_level,
            importance_confirmed_by_user: tx.importance_confirmed_by_user,
            current_category_name: tx.categories?.name ?? null,
          })) as any}
        />
      )}
    </PageContainer>
  );
}
