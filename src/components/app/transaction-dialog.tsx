import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { L } from "@/lib/labels";
import { labelImp, importanceBadgeClass, type Importance } from "@/lib/suggestions";
import { parseLocaleAmount } from "@/lib/format";
import { billingMonthForPurchase } from "@/lib/credit-card-reconciliation";

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction?: any | null;
}) {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [cardId, setCardId] = useState<string>("");
  const [installment, setInstallment] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");

  const wsId = workspace?.id;
  const t = workspace ? L(workspace.type) : L("personal");
  const editing = !!transaction?.id;

  const { data: categories } = useQuery({
    queryKey: ["categories", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,type,color,importance_level" as any)
        .eq("workspace_id", wsId!)
        .eq("is_active", true)
        .order("name");
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
  const { data: cards } = useQuery({
    queryKey: ["cards", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")
        .eq("workspace_id", wsId!)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Load transaction fields into form when editing / reset when creating.
  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType((transaction.type ?? "expense") as any);
      setDate(transaction.date ?? new Date().toISOString().slice(0, 10));
      setAmount(transaction.amount != null ? String(transaction.amount).replace(".", ",") : "");
      setDescription(transaction.description ?? "");
      setCategoryId(transaction.category_id ?? "");
      setAccountId(transaction.account_id ?? "");
      setCardId(transaction.credit_card_id ?? "");
      setInstallment(transaction.installment ?? "");
      setCounterparty(transaction.counterparty ?? "");
      setNotes(transaction.notes ?? "");
    } else {
      setType("expense");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setDescription("");
      setCategoryId("");
      setAccountId("");
      setCardId("");
      setInstallment("");
      setCounterparty("");
      setNotes("");
    }
  }, [open, transaction]);

  // Reset category when switching type on a fresh entry only (keeps edit intact).
  useEffect(() => {
    if (open && !transaction) setCategoryId("");
  }, [type, open, transaction]);

  const selectedCategory = (categories ?? []).find((c: any) => c.id === categoryId) as
    | any
    | undefined;
  const inheritedImportance: Importance = (selectedCategory?.importance_level ??
    "flexible") as Importance;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Workspace ausente");
      const desc = description.trim();
      if (!desc) throw new Error("Informe a descrição.");
      if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime()))
        throw new Error("Data inválida.");
      const amt = parseLocaleAmount(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Valor inválido.");
      if (accountId && cardId) throw new Error("Escolha conta OU cartão, não os dois.");
      const installmentValue = cardId ? installment.trim().slice(0, 30) || null : null;
      const selectedCard = (cards ?? []).find((card: any) => card.id === cardId) as
        | any
        | undefined;
      const invoiceMonth = selectedCard
        ? billingMonthForPurchase(date, selectedCard.closing_day, selectedCard.due_day)
        : null;
      const financialDate = invoiceMonth ?? date;
      const monthN = Number(financialDate.slice(5, 7));
      const yearN = Number(financialDate.slice(0, 4));

      if (editing) {
        // Preserve manual overrides: don't rewrite importance fields on edit.
        const patch: Record<string, any> = {
          date,
          month: monthN,
          year: yearN,
          type,
          amount: amt,
          description: desc,
          category_id: categoryId || null,
          account_id: accountId || null,
          credit_card_id: cardId || null,
          invoice_month: invoiceMonth,
          installment: installmentValue,
          counterparty: counterparty || null,
          notes: notes || null,
        };
        const { error } = await supabase
          .from("transactions")
          .update(patch as any)
          .eq("id", transaction.id)
          .eq("workspace_id", wsId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert({
          workspace_id: wsId,
          date,
          month: monthN,
          year: yearN,
          type,
          amount: amt,
          description: desc,
          category_id: categoryId || null,
          account_id: accountId || null,
          credit_card_id: cardId || null,
          invoice_month: invoiceMonth,
          installment: installmentValue,
          counterparty: counterparty || null,
          notes: notes || null,
          source: "manual",
          status: "confirmed",
          importance_level: selectedCategory ? inheritedImportance : null,
          suggested_importance_level: selectedCategory ? inheritedImportance : null,
          importance_status: selectedCategory ? "suggested" : null,
          importance_confidence: selectedCategory ? 0.5 : null,
          importance_suggestion_reason: selectedCategory ? "Importância padrão da categoria" : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Transação atualizada" : "Transação salva");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactions-year"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["ba-txs"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredCats = (categories ?? []).filter((c: any) => c.type === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar transação" : "Nova transação"}</DialogTitle>
        </DialogHeader>
        <Tabs value={type} onValueChange={(v) => setType(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="expense">{t.expenseSingular}</TabsTrigger>
            <TabsTrigger value="income">{t.incomeSingular}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Supermercado"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {filteredCats.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCategory && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                Importância sugerida:{" "}
                <Badge variant="secondary" className={importanceBadgeClass(inheritedImportance)}>
                  {labelImp(inheritedImportance)}
                </Badge>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select
                value={accountId}
                onValueChange={(v) => {
                  setAccountId(v);
                  setCardId("");
                  setInstallment("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cartão</Label>
              <Select
                value={cardId}
                onValueChange={(v) => {
                  setCardId(v);
                  setAccountId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(cards ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cardId && date && selectedCardForPreview(cards, cardId) && (
                <p className="text-xs text-muted-foreground">
                  Entra no mês financeiro de{" "}
                  {formatInvoiceMonth(
                    billingMonthForPurchase(
                      date,
                      selectedCardForPreview(cards, cardId)!.closing_day,
                      selectedCardForPreview(cards, cardId)!.due_day,
                    ),
                  )}
                  .
                </p>
              )}
            </div>
          </div>
          {cardId && (
            <div className="space-y-1.5">
              <Label>Parcela</Label>
              <Input
                value={installment}
                onChange={(e) => setInstallment(e.target.value)}
                placeholder="Ex.: 5/12"
                maxLength={30}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Favorecido / Origem</Label>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function selectedCardForPreview(cards: any[] | undefined, cardId: string) {
  return (cards ?? []).find((card: any) => card.id === cardId);
}

function formatInvoiceMonth(invoiceMonth: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${invoiceMonth}T12:00:00Z`));
}
