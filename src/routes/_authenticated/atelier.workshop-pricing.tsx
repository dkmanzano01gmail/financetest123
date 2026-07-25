import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, Pencil, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/workshop-pricing")({
  component: Page,
});
const sb = supabase as any;
const num = (s: string) => Number((s ?? "").replace(",", ".") || 0);
const empty = {
  name: "",
  event_date: "",
  attendees: "0",
  price_per_person: "290",
  clay_cost: "0",
  glaze_cost: "0",
  firing_cost: "0",
  food_cost: "0",
  labor_cost: "0",
  other_cost: "0",
  notes: "",
};

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(empty);

  const { data: rows } = useQuery({
    queryKey: ["workshop_pricing", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await sb
          .from("workshop_pricing")
          .select("*")
          .eq("workspace_id", wsId)
          .order("event_date", { ascending: false, nullsFirst: false })
      ).data ?? [],
  });

  const calc = useMemo(() => {
    const attendees = num(f.attendees),
      price = num(f.price_per_person);
    const revenue = attendees * price;
    const cost =
      num(f.clay_cost) +
      num(f.glaze_cost) +
      num(f.firing_cost) +
      num(f.food_cost) +
      num(f.labor_cost) +
      num(f.other_cost);
    const profit = revenue - cost;
    const margin = revenue ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin };
  }, [f]);

  const save = useMutation({
    mutationFn: async () => {
      const p: any = {
        workspace_id: wsId,
        name: f.name,
        event_date: f.event_date || null,
        attendees: Math.round(num(f.attendees)),
        price_per_person: num(f.price_per_person),
        clay_cost: num(f.clay_cost),
        glaze_cost: num(f.glaze_cost),
        firing_cost: num(f.firing_cost),
        food_cost: num(f.food_cost),
        labor_cost: num(f.labor_cost),
        other_cost: num(f.other_cost),
        total_revenue: calc.revenue,
        total_cost: calc.cost,
        profit: calc.profit,
        margin_percent: calc.margin,
        notes: f.notes || null,
      };
      const { error } = editId
        ? await sb.from("workshop_pricing").update(p).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("workshop_pricing").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workshop_pricing"] });
      setOpen(false);
      setEditId(null);
      setF(empty);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("workshop_pricing")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workshop_pricing"] }),
  });

  function edit(r: any) {
    setEditId(r.id);
    setF({
      name: r.name,
      event_date: r.event_date ?? "",
      attendees: String(r.attendees),
      price_per_person: String(r.price_per_person),
      clay_cost: String(r.clay_cost),
      glaze_cost: String(r.glaze_cost),
      firing_cost: String(r.firing_cost),
      food_cost: String(r.food_cost),
      labor_cost: String(r.labor_cost),
      other_cost: String(r.other_cost),
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Precificação de Workshops"
        description="Custo, receita e margem por evento"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setF(empty);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Novo workshop
          </Button>
        }
      />
      {(rows?.length ?? 0) === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Sem workshops cadastrados"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Novo workshop
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows!.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.event_date ?? "—"} · {r.attendees} pessoas
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => edit(r)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Receita</div>
                    <div className="font-mono text-income">
                      {formatCurrency(Number(r.total_revenue), currency, privacy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Custo</div>
                    <div className="font-mono text-expense">
                      {formatCurrency(Number(r.total_cost), currency, privacy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Lucro ({Number(r.margin_percent).toFixed(0)}%)
                    </div>
                    <div className="font-mono">
                      {formatCurrency(Number(r.profit), currency, privacy)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar workshop" : "Novo workshop"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={f.event_date}
                onChange={(e) => setF({ ...f, event_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <Input
                value={f.attendees}
                onChange={(e) => setF({ ...f, attendees: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preço/pessoa</Label>
              <Input
                value={f.price_per_person}
                onChange={(e) => setF({ ...f, price_per_person: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Argila</Label>
              <Input
                value={f.clay_cost}
                onChange={(e) => setF({ ...f, clay_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Esmalte</Label>
              <Input
                value={f.glaze_cost}
                onChange={(e) => setF({ ...f, glaze_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Queimas</Label>
              <Input
                value={f.firing_cost}
                onChange={(e) => setF({ ...f, firing_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Café/alimentação</Label>
              <Input
                value={f.food_cost}
                onChange={(e) => setF({ ...f, food_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instrutor</Label>
              <Input
                value={f.labor_cost}
                onChange={(e) => setF({ ...f, labor_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Outros</Label>
              <Input
                value={f.other_cost}
                onChange={(e) => setF({ ...f, other_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
          </div>
          <Card className="mt-3">
            <CardContent className="p-4 grid grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Receita</div>
                <div className="font-mono text-income">
                  {formatCurrency(calc.revenue, currency, privacy)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Custo</div>
                <div className="font-mono text-expense">
                  {formatCurrency(calc.cost, currency, privacy)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Lucro</div>
                <div className="font-mono">{formatCurrency(calc.profit, currency, privacy)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Margem</div>
                <div className="font-mono">{calc.margin.toFixed(1)}%</div>
              </div>
            </CardContent>
          </Card>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !f.name}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
