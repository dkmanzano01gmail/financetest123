import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency } from "@/lib/format";
import { Plus, Wallet, Power } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({ component: AccountsPage });

function AccountsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState("checking");
  const [balance, setBalance] = useState("");
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;

  const { data: accounts } = useQuery({
    queryKey: ["accounts-full", wsId],
    enabled: !!wsId,
    queryFn: async () => (await supabase.from("accounts").select("*").eq("workspace_id", wsId!).order("created_at")).data ?? [],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounts").insert({
        workspace_id: wsId!, name, institution: institution || null, type: type as any,
        initial_balance: Number(balance.replace(",", ".") || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts-full"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); toast.success("Conta criada"); setOpen(false); setName(""); setInstitution(""); setBalance(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("accounts").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts-full"] }),
  });

  return (
    <PageContainer>
      <PageHeader title="Contas" description="Suas contas bancárias e carteiras"
        action={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Nova conta</Button>} />

      {(accounts?.length ?? 0) === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma conta cadastrada" description="Cadastre suas contas para acompanhar saldos."
          action={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Nova conta</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts!.map((a: any) => (
            <Card key={a.id} className={a.is_active ? "" : "opacity-60"}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.institution ?? "—"} · {labelType(a.type)}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => toggleMut.mutate({ id: a.id, is_active: !a.is_active })}>
                    <Power className="w-4 h-4" />
                  </Button>
                </div>
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground">Saldo inicial</div>
                  <div className="font-display text-2xl">{formatCurrency(Number(a.initial_balance), currency, privacy)}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Instituição</Label><Input value={institution} onChange={(e) => setInstitution(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
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
            <div className="space-y-1.5"><Label>Saldo inicial</Label><Input placeholder="0,00" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function labelType(t: string) {
  return { checking: "Corrente", savings: "Poupança", cash: "Dinheiro", investment: "Investimento", other: "Outro" }[t] ?? t;
}
