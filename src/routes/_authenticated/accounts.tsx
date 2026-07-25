import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, formatDate } from "@/lib/format";
import { parseLocaleAmount } from "@/lib/format";
import { Plus, Wallet, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useLabelOverrides, applyLabel } from "@/hooks/use-label-overrides";

export const Route = createFileRoute("/_authenticated/accounts")({ component: AccountsPage });

type AccountForm = {
  name: string;
  institution: string;
  type: string;
  initial_balance: string;
  initial_balance_date: string;
  is_active: boolean;
  notes: string;
};

const emptyForm = (): AccountForm => ({
  name: "",
  institution: "",
  type: "checking",
  initial_balance: "",
  initial_balance_date: new Date().toISOString().slice(0, 10),
  is_active: true,
  notes: "",
});

function AccountsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;

  const { data: accounts } = useQuery({
    queryKey: ["accounts-full", wsId],
    enabled: !!wsId,
    queryFn: async () => (await supabase.from("accounts").select("*").eq("workspace_id", wsId!).order("created_at")).data ?? [],
  });
  const { data: labels } = useLabelOverrides(wsId);
  const pageTitle = applyLabel(labels, "nav.accounts", "Contas");

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(a: any) {
    setEditingId(a.id);
    setForm({
      name: a.name ?? "",
      institution: a.institution ?? "",
      type: a.type ?? "checking",
      initial_balance: a.initial_balance != null ? String(a.initial_balance) : "",
      initial_balance_date: a.initial_balance_date ?? "",
      is_active: !!a.is_active,
      notes: a.notes ?? "",
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome da conta.");
      if (!form.initial_balance_date) throw new Error("Informe a data de referência do saldo inicial.");
      const rawBal = form.initial_balance.trim();
      const parsedBal = rawBal ? parseLocaleAmount(rawBal) : 0;
      if (rawBal && !Number.isFinite(parsedBal)) throw new Error("Saldo inicial inválido.");
      const payload = {
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        type: form.type as any,
        initial_balance: parsedBal,
        initial_balance_date: form.initial_balance_date,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("accounts").update(payload as any).eq("id", editingId).eq("workspace_id", wsId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert({ workspace_id: wsId!, ...payload } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts-full"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["recon-accounts"] });
      toast.success(editingId ? "Conta atualizada" : "Conta criada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase.from("accounts").delete().eq("id", editingId).eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts-full"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["recon-accounts"] });
      toast.success("Conta excluída");
      setConfirmDelete(false);
      setOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message.includes("foreign key") ? "Existem transações nesta conta. Inative-a em vez de excluir." : e.message);
    },
  });

  const dateMissing = !form.initial_balance_date;

  return (
    <PageContainer>
      <PageHeader title={pageTitle} description="Suas contas bancárias e carteiras"
        action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova conta</Button>} />

      {(accounts?.length ?? 0) === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma conta cadastrada" description="Cadastre suas contas para acompanhar saldos."
          action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova conta</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts!.map((a: any) => {
            const incomplete = !a.initial_balance_date;
            return (
              <Card key={a.id} className={a.is_active ? "" : "opacity-60"}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.institution ?? "—"} · {labelType(a.type)}</div>
                    </div>
                    <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Ativa" : "Inativa"}</Badge>
                  </div>
                  <div className="mt-4">
                    <div className="text-xs text-muted-foreground">Saldo inicial</div>
                    <div className="font-display text-2xl">{formatCurrency(Number(a.initial_balance), currency, privacy)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {a.initial_balance_date ? `Data: ${formatDate(a.initial_balance_date)}` : "Sem data de referência"}
                    </div>
                  </div>
                  {incomplete && (
                    <div className="mt-3 flex items-start gap-2 text-xs p-2 rounded-md bg-amber-50 text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>Saldo inicial incompleto</span>
                    </div>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(a)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      {incomplete ? "Completar informações" : "Editar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar conta" : "Nova conta"}</DialogTitle>
            <DialogDescription>O saldo inicial representa o saldo da conta na data informada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome da conta</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instituição</Label>
                <Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Conta corrente</SelectItem>
                    <SelectItem value="savings">Poupança</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="investment">Investimento</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Saldo inicial</Label>
                <Input placeholder="0,00" value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data do saldo inicial *</Label>
                <Input type="date" value={form.initial_balance_date} onChange={(e) => setForm({ ...form, initial_balance_date: e.target.value })} />
                {dateMissing && <p className="text-xs text-destructive">Informe a data de referência do saldo inicial.</p>}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Conta ativa</Label>
                <p className="text-xs text-muted-foreground">Contas inativas ficam ocultas em lançamentos.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {editingId && (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Excluir</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.name || dateMissing}>
                {editingId ? "Salvar alterações" : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Se existirem transações vinculadas, prefira inativar a conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function labelType(t: string) {
  return { checking: "Corrente", savings: "Poupança", cash: "Dinheiro", investment: "Investimento", other: "Outro" }[t] ?? t;
}
