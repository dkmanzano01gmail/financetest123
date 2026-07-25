import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, parseLocaleAmount } from "@/lib/format";
import { Plus, CreditCard, Power } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cards")({ component: CardsPage });

function CardsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    institution: "",
    brand: "",
    limit_amount: "",
    closing_day: "1",
    due_day: "10",
  });
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;

  const { data: cards } = useQuery({
    queryKey: ["cards-full", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await supabase
          .from("credit_cards")
          .select("*")
          .eq("workspace_id", wsId!)
          .order("created_at")
      ).data ?? [],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do cartão.");
      const limit = form.limit_amount.trim() ? parseLocaleAmount(form.limit_amount) : 0;
      if (form.limit_amount.trim() && !Number.isFinite(limit)) throw new Error("Limite inválido.");
      const cd = Number(form.closing_day),
        dd = Number(form.due_day);
      if (!Number.isInteger(cd) || cd < 1 || cd > 31)
        throw new Error("Dia de fechamento inválido.");
      if (!Number.isInteger(dd) || dd < 1 || dd > 31)
        throw new Error("Dia de vencimento inválido.");
      const { error } = await supabase.from("credit_cards").insert({
        workspace_id: wsId!,
        name: form.name.trim(),
        institution: form.institution.trim() || null,
        brand: form.brand.trim() || null,
        limit_amount: limit,
        closing_day: cd,
        due_day: dd,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards-full"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      setOpen(false);
      toast.success("Cartão criado");
      setForm({
        name: "",
        institution: "",
        brand: "",
        limit_amount: "",
        closing_day: "1",
        due_day: "10",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("credit_cards")
        .update({ is_active })
        .eq("id", id)
        .eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards-full"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Cartões"
        description="Cartões de crédito do workspace"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Novo cartão
          </Button>
        }
      />

      {(cards?.length ?? 0) === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Novo cartão
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards!.map((c: any) => (
            <Card
              key={c.id}
              className={`${c.is_active ? "" : "opacity-60"} relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.institution ?? "—"} {c.brand ? `· ${c.brand}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleMut.mutate({ id: c.id, is_active: !c.is_active })}
                  >
                    <Power className="w-4 h-4" />
                  </Button>
                </div>
                <div className="mt-4">
                  <div className="text-xs text-muted-foreground">Limite</div>
                  <div className="font-display text-2xl">
                    {formatCurrency(Number(c.limit_amount), currency, privacy)}
                  </div>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <div>
                    Fechamento dia{" "}
                    <span className="text-foreground font-medium">{c.closing_day}</span>
                  </div>
                  <div>
                    Vencimento dia <span className="text-foreground font-medium">{c.due_day}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cartão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Instituição</Label>
                <Input
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bandeira</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Limite</Label>
              <Input
                placeholder="0,00"
                value={form.limit_amount}
                onChange={(e) => setForm({ ...form, limit_amount: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia de fechamento</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.closing_day}
                  onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dia de vencimento</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(e) => setForm({ ...form, due_day: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
