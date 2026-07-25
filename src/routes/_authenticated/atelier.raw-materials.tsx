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
import { formatCurrency } from "@/lib/format";
import { Plus, Trash2, Package, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/raw-materials")({
  component: RawMaterialsPage,
});
const sb = supabase as any;
const empty = {
  name: "",
  material_type: "",
  supplier: "",
  unit: "kg",
  quantity_purchased: "0",
  quantity_available: "0",
  unit_cost: "0",
  purchase_date: "",
  min_stock: "0",
  notes: "",
};

function RawMaterialsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(empty);

  const { data: items } = useQuery({
    queryKey: ["raw_materials", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (await sb.from("raw_materials").select("*").eq("workspace_id", wsId).order("name")).data ??
      [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const p: any = {
        workspace_id: wsId,
        name: f.name,
        material_type: f.material_type || null,
        supplier: f.supplier || null,
        unit: f.unit,
        quantity_purchased: Number(f.quantity_purchased.replace(",", ".") || 0),
        quantity_available: Number(f.quantity_available.replace(",", ".") || 0),
        unit_cost: Number(f.unit_cost.replace(",", ".") || 0),
        purchase_date: f.purchase_date || null,
        min_stock: Number(f.min_stock.replace(",", ".") || 0),
        notes: f.notes || null,
      };
      const { error } = editId
        ? await sb.from("raw_materials").update(p).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("raw_materials").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["raw_materials"] });
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
        .from("raw_materials")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["raw_materials"] }),
  });

  function edit(i: any) {
    setEditId(i.id);
    setF({
      name: i.name,
      material_type: i.material_type ?? "",
      supplier: i.supplier ?? "",
      unit: i.unit,
      quantity_purchased: String(i.quantity_purchased),
      quantity_available: String(i.quantity_available),
      unit_cost: String(i.unit_cost),
      purchase_date: i.purchase_date ?? "",
      min_stock: String(i.min_stock),
      notes: i.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Matéria-prima"
        description="Estoque, fornecedores e custo unitário"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setF(empty);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Novo
          </Button>
        }
      />
      {(items?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Package}
          title="Sem materiais cadastrados"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Novo
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items!.map((i: any) => {
            const low =
              Number(i.quantity_available) <= Number(i.min_stock) && Number(i.min_stock) > 0;
            return (
              <Card key={i.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{i.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.material_type ?? "—"} · {i.supplier ?? "—"}
                      </div>
                    </div>
                    {low && (
                      <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        baixo
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Disponível</div>
                      <div className="font-mono">
                        {i.quantity_available} {i.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Comprado</div>
                      <div className="font-mono">
                        {i.quantity_purchased} {i.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Custo/un.</div>
                      <div className="font-mono">
                        {formatCurrency(Number(i.unit_cost), currency, privacy)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Mínimo</div>
                      <div className="font-mono">
                        {i.min_stock} {i.unit}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 justify-end mt-2">
                    <Button variant="ghost" size="icon" onClick={() => edit(i)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(i.id)}>
                      <Trash2 className="w-4 h-4" />
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
            <DialogTitle>{editId ? "Editar material" : "Novo material"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Input
                value={f.material_type}
                onChange={(e) => setF({ ...f, material_type: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor</Label>
              <Input
                value={f.supplier}
                onChange={(e) => setF({ ...f, supplier: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Data da compra</Label>
              <Input
                type="date"
                value={f.purchase_date}
                onChange={(e) => setF({ ...f, purchase_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. comprada</Label>
              <Input
                value={f.quantity_purchased}
                onChange={(e) => setF({ ...f, quantity_purchased: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Qtd. disponível</Label>
              <Input
                value={f.quantity_available}
                onChange={(e) => setF({ ...f, quantity_available: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Custo unitário</Label>
              <Input
                value={f.unit_cost}
                onChange={(e) => setF({ ...f, unit_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estoque mínimo</Label>
              <Input
                value={f.min_stock}
                onChange={(e) => setF({ ...f, min_stock: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
          </div>
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
