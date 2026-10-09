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
import {
  isAccountMovement,
  movementConversionDefaults,
} from "@/lib/account-movements";

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
  const [entryKind, setEntryKind] = useState<"regular" | "transfer" | "investment">("regular");
  const [investmentAction, setInvestmentAction] = useState<"contribution" | "redemption">(
    "contribution",
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [destinationAccountId, setDestinationAccountId] = useState<string>("");
  const [cardId, setCardId] = useState<string>("");
  const [installment, setInstallment] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");

  const wsId = workspace?.id;
  const t = workspace ? L(workspace.type) : L("personal");
  const editing = !!transaction?.id;
  const conversionUnavailable =
    editing &&
    (isAccountMovement(transaction) ||
      !!transaction?.credit_card_id ||
      !!transaction?.linked_credit_card_id ||
      !!transaction?.reversal_of_transaction_id);

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
      const suggestedKind = transaction.suggested_entry_kind;
      if (suggestedKind === "transfer" && !conversionUnavailable) {
        const defaults = movementConversionDefaults(transaction);
        setEntryKind("transfer");
        setInvestmentAction(defaults.investmentAction);
        setSourceAccountId(defaults.sourceAccountId);
        setDestinationAccountId(defaults.destinationAccountId);
      } else {
        setEntryKind("regular");
        setSourceAccountId("");
        setDestinationAccountId("");
      }
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
      setEntryKind("regular");
      setType("expense");
      setInvestmentAction("contribution");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setDescription("");
      setCategoryId("");
      setAccountId("");
      setSourceAccountId("");
      setDestinationAccountId("");
      setCardId("");
      setInstallment("");
      setCounterparty("");
      setNotes("");
    }
  }, [conversionUnavailable, open, transaction]);

  // Reset category when switching type on a fresh entry only (keeps edit intact).
  useEffect(() => {
    if (open && !transaction) setCategoryId("");
  }, [type, entryKind, open, transaction]);

  const selectedCategory = (categories ?? []).find((c: any) => c.id === categoryId) as
    any | undefined;
  const inheritedImportance: Importance = (selectedCategory?.importance_level ??
    "flexible") as Importance;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Workspace ausente");
      if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime()))
        throw new Error("Data inválida.");
      const amt = parseLocaleAmount(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Valor inválido.");
      const desc = description.trim();

      if (entryKind !== "regular") {
        if (!sourceAccountId || !destinationAccountId)
          throw new Error("Informe as contas de origem e destino.");
        if (sourceAccountId === destinationAccountId)
          throw new Error("A conta de origem deve ser diferente da conta de destino.");
        const movementKind =
          entryKind === "transfer"
            ? "internal_transfer"
            : investmentAction === "contribution"
              ? "investment_contribution"
              : "investment_redemption";
        const rpcName = editing
          ? "convert_transaction_to_account_movement"
          : "create_account_movement";
        const rpcArgs: Record<string, any> = {
          p_workspace_id: wsId,
          p_date: date,
          p_amount: amt,
          p_description: desc || null,
          p_source_account_id: sourceAccountId,
          p_destination_account_id: destinationAccountId,
          p_movement_kind: movementKind,
          p_notes: notes.trim() || null,
        };
        if (editing) rpcArgs.p_transaction_id = transaction.id;
        const { error } = await (supabase.rpc as any)(rpcName, rpcArgs);
        if (error) throw error;
        return;
      }

      if (!desc) throw new Error("Informe a descrição.");
      if (accountId && cardId) throw new Error("Escolha conta OU cartão, não os dois.");
      const installmentValue = cardId ? installment.trim().slice(0, 30) || null : null;
      const selectedCard = (cards ?? []).find((card: any) => card.id === cardId) as any | undefined;
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
      toast.success(
        entryKind === "regular"
          ? editing
            ? "Transação atualizada"
            : "Transação salva"
          : editing
            ? "Transação convertida em movimentação vinculada"
            : "Movimentação registrada nas duas contas",
      );
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactions-year"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["ba-txs"] });
      qc.invalidateQueries({ queryKey: ["accounts-full"] });
      qc.invalidateQueries({ queryKey: ["recon-txs"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredCats = (categories ?? []).filter((c: any) => c.type === type);
  const ordinaryAccounts = (accounts ?? []).filter((account: any) => account.type !== "investment");
  const investmentAccounts = (accounts ?? []).filter(
    (account: any) => account.type === "investment",
  );
  const sourceOptions =
    entryKind === "transfer"
      ? ordinaryAccounts
      : investmentAction === "contribution"
        ? ordinaryAccounts
        : investmentAccounts;
  const destinationOptions =
    entryKind === "transfer"
      ? ordinaryAccounts
      : investmentAction === "contribution"
        ? investmentAccounts
        : ordinaryAccounts;
  const tabValue = entryKind === "regular" ? type : entryKind;

  const initializeMovementConversion = (kind: "transfer" | "investment") => {
    if (!editing) {
      setSourceAccountId("");
      setDestinationAccountId("");
      return;
    }
    const currentAccount = (accounts ?? []).find(
      (account: any) => account.id === transaction?.account_id,
    ) as any | undefined;
    const defaults = movementConversionDefaults(transaction, currentAccount?.type);
    setInvestmentAction(defaults.investmentAction);
    setSourceAccountId(defaults.sourceAccountId);
    setDestinationAccountId(defaults.destinationAccountId);
    if (kind === "transfer" && currentAccount?.type === "investment") {
      setSourceAccountId("");
      setDestinationAccountId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar transação" : "Nova transação"}</DialogTitle>
        </DialogHeader>
        <Tabs
          value={tabValue}
          onValueChange={(value) => {
            if (value === "income" || value === "expense") {
              setEntryKind("regular");
              setType(value);
            } else {
              setEntryKind(value as "transfer" | "investment");
              setCategoryId("");
              setAccountId("");
              setCardId("");
              setInstallment("");
              initializeMovementConversion(value as "transfer" | "investment");
            }
          }}
        >
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="expense">{t.expenseSingular}</TabsTrigger>
            <TabsTrigger value="income">{t.incomeSingular}</TabsTrigger>
            <TabsTrigger value="transfer" disabled={conversionUnavailable}>
              Transferir
            </TabsTrigger>
            <TabsTrigger value="investment" disabled={conversionUnavailable}>
              Investir
            </TabsTrigger>
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
          {entryKind === "regular" ? (
            <>
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
                    <Badge
                      variant="secondary"
                      className={importanceBadgeClass(inheritedImportance)}
                    >
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
                    onValueChange={(value) => {
                      setAccountId(value);
                      setCardId("");
                      setInstallment("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {(accounts ?? []).map((account: any) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Cartão</Label>
                  <Select
                    value={cardId}
                    onValueChange={(value) => {
                      setCardId(value);
                      setAccountId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {(cards ?? []).map((card: any) => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.name}
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
            </>
          ) : (
            <>
              {entryKind === "investment" && (
                <div className="space-y-1.5">
                  <Label>Operação</Label>
                  <Select
                    value={investmentAction}
                    onValueChange={(value) => {
                      setInvestmentAction(value as "contribution" | "redemption");
                      setSourceAccountId("");
                      setDestinationAccountId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contribution">Aporte em investimento</SelectItem>
                      <SelectItem value="redemption">Resgate de investimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Conta de origem</Label>
                  <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions
                        .filter((account: any) => account.id !== destinationAccountId)
                        .map((account: any) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Conta de destino</Label>
                  <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationOptions
                        .filter((account: any) => account.id !== sourceAccountId)
                        .map((account: any) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {entryKind === "investment" && investmentAccounts.length === 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  Cadastre primeiro uma conta do tipo Investimento na aba Contas.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {editing
                  ? "A transação atual será preservada como um dos lados e o sistema criará o lançamento correspondente na outra conta."
                  : "O sistema registrará a saída e a entrada vinculadas."}{" "}
                A operação altera os saldos das contas, mas não será somada como receita ou despesa.
              </p>
              <div className="space-y-1.5">
                <Label>Descrição opcional</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    entryKind === "transfer"
                      ? "Ex.: Transferência para conta reserva"
                      : investmentAction === "contribution"
                        ? "Ex.: Aporte mensal"
                        : "Ex.: Resgate de CDB"
                  }
                />
              </div>
            </>
          )}
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
            {editing && entryKind !== "regular" ? "Converter e salvar" : "Salvar"}
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
