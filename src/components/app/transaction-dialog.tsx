import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { L } from "@/lib/labels";

export function TransactionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [cardId, setCardId] = useState<string>("");
  const [counterparty, setCounterparty] = useState("");
  const [notes, setNotes] = useState("");

  const wsId = workspace?.id;
  const t = workspace ? L(workspace.type) : L("personal");

  const { data: categories } = useQuery({
    queryKey: ["categories", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").eq("workspace_id", wsId!).eq("is_active", true).order("name");
      return data ?? [];
    },
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("*").eq("workspace_id", wsId!).eq("is_active", true);
      return data ?? [];
    },
  });
  const { data: cards } = useQuery({
    queryKey: ["cards", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data } = await supabase.from("credit_cards").select("*").eq("workspace_id", wsId!).eq("is_active", true);
      return data ?? [];
    },
  });

  useEffect(() => { if (open) setCategoryId(""); }, [open, type]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Workspace ausente");
      const amt = Number(amount.replace(",", "."));
      if (!amt || amt <= 0) throw new Error("Valor inválido");
      const { error } = await supabase.from("transactions").insert({
        workspace_id: wsId,
        date,
        type,
        amount: amt,
        description,
        category_id: categoryId || null,
        account_id: accountId || null,
        credit_card_id: cardId || null,
        counterparty: counterparty || null,
        notes: notes || null,
        source: "manual",
        status: "confirmed",
        month: Number(date.slice(5,7)),
        year: Number(date.slice(0,4)),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transação salva");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactions-year"] });
      onOpenChange(false);
      setAmount(""); setDescription(""); setCounterparty(""); setNotes("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredCats = (categories ?? []).filter((c: any) => c.type === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Nova transação</DialogTitle></DialogHeader>
        <Tabs value={type} onValueChange={(v) => setType(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="expense">{t.expenseSingular}</TabsTrigger>
            <TabsTrigger value="income">{t.incomeSingular}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Valor</Label><Input placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Supermercado" /></div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>{filteredCats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={(v) => { setAccountId(v); setCardId(""); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(accounts ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cartão</Label>
              <Select value={cardId} onValueChange={(v) => { setCardId(v); setAccountId(""); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{(cards ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Favorecido / Origem</Label><Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
