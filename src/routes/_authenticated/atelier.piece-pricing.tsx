import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
import { calculateKilnCost, calculatePiecePrice, resolveFiringProfile } from "@/lib/orna-logic";
import { Plus, Trash2, Pencil, Palette, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/piece-pricing")({ component: Page });
const sb = supabase as any;
const num = (s: string) => Number((s ?? "").replace(",", ".") || 0);
const emptyF = {
  name: "",
  quantity: "1",
  height_cm: "0",
  length_cm: "0",
  depth_cm: "0",
  clay_grams: "0",
  glaze_grams: "0",
  glaze_cone: "6",
  labor_cost: "0",
  packaging_cost: "0",
  other_cost: "0",
  customization_cost: "0",
  fixed_allocation: "0",
  margin_percent: "100",
  notes: "",
};

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [defOpen, setDefOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(emptyF);

  const { data: defaults } = useQuery({
    queryKey: ["piece_pricing_defaults", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (await sb.from("piece_pricing_defaults").select("*").eq("workspace_id", wsId).maybeSingle())
        .data ?? {
        clay_kg_price: 7.7,
        glaze_gram_price: 1,
        biscuit_coeff: 0.0045,
        glaze_firing_coeff: 0.007,
        default_labor: 25,
        default_packaging: 5,
        default_margin_percent: 100,
        kiln_firing_profit_percent: 100,
        loss_percent: 10,
        payment_fee_percent: 3.5,
        tax_percent: 0,
        expected_discount_percent: 0,
      },
  });
  const { data: firingSettings } = useQuery({
    queryKey: ["firing_settings", wsId, "piece-pricing"],
    enabled: !!wsId,
    queryFn: async () =>
      (await sb.from("firing_settings").select("*").eq("workspace_id", wsId).maybeSingle()).data ?? {
        oven_diameter_cm: 57,
        area_adjustment: 1.0825,
        resistance_cost: 2000,
        resistance_burns: 275,
        power_kw: 9.85,
        biscuit_hours: 9,
        glaze_hours: 10.5,
        utilization: 0.65,
        kwh_cost: 1,
        final_buffer: 0.1,
        biscuit_resistance_burns: 275,
        biscuit_utilization: 0.65,
        glaze6_resistance_burns: 175,
        glaze6_hours: 10.5,
        glaze6_utilization: 0.75,
        glaze7_resistance_burns: 150,
        glaze7_hours: 11,
        glaze7_utilization: 0.78,
        glaze10_resistance_burns: 110,
        glaze10_hours: 12,
        glaze10_utilization: 0.9,
      },
  });

  const { data: rows } = useQuery({
    queryKey: ["piece_pricing", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await sb
          .from("piece_pricing")
          .select("*")
          .eq("workspace_id", wsId)
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const [d, setD] = useState<any>(defaults);
  useEffect(() => {
    setD(defaults);
  }, [defaults]);

  const breakdown = useMemo(() => {
    const height = num(f.height_cm);
    const length = num(f.length_cm);
    const depth = num(f.depth_cm);
    const bisqueProfile = resolveFiringProfile(firingSettings, "biscuit", "Biscoito");
    const glazeProfile = resolveFiringProfile(firingSettings, "glaze", f.glaze_cone);
    const buildKilnInput = (profile: ReturnType<typeof resolveFiringProfile>) => ({
      lengthCm: length,
      depthCm: depth,
      ovenDiameter: profile.ovenDiameter,
      areaAdjustment: profile.areaAdjustment,
      resistanceCost: profile.resistanceCost,
      resistanceBurns: profile.resistanceBurns,
      powerKw: profile.powerKw,
      hours: profile.hours,
      utilization: profile.utilization,
      kwhCost: profile.kwhCost,
      finalBuffer: profile.finalBuffer,
    });
    const bisque = calculateKilnCost(buildKilnInput(bisqueProfile));
    const glazeFiring = calculateKilnCost(buildKilnInput(glazeProfile));
    const result = calculatePiecePrice({
      quantity: num(f.quantity),
      clayWeightKg: num(f.clay_grams) / 1000,
      clay10kgPrice: Number(defaults?.clay_kg_price ?? 7.7) * 10,
      glazeGrams: num(f.glaze_grams),
      glazeCostPerGram: Number(defaults?.glaze_gram_price ?? 1),
      bisqueCost: bisque.unitCost,
      glazeFiringCost: glazeFiring.unitCost,
      kilnFiringProfitRate: Number(defaults?.kiln_firing_profit_percent ?? 100) / 100,
      laborCost: num(f.labor_cost),
      packagingCost: num(f.packaging_cost),
      otherDirectCosts: num(f.other_cost),
      customizationCost: num(f.customization_cost),
      fixedAllocation: num(f.fixed_allocation),
      lossRate: Number(defaults?.loss_percent ?? 0) / 100,
      desiredProfitRate: num(f.margin_percent) / 100,
      paymentFeeRate: Number(defaults?.payment_fee_percent ?? 0) / 100,
      taxRate: Number(defaults?.tax_percent ?? 0) / 100,
      expectedDiscountRate: Number(defaults?.expected_discount_percent ?? 0) / 100,
    });
    return {
      clayCost: result.clayCost,
      glazeCost: result.glazeCost,
      biscuit: bisque.unitCost,
      glazeFiring: glazeFiring.unitCost,
      labor: num(f.labor_cost),
      pack: num(f.packaging_cost),
      other: num(f.other_cost),
      customization: num(f.customization_cost),
      fixedAllocation: num(f.fixed_allocation),
      losses: result.lossesCost,
      total: result.directCost,
      suggested: result.suggestedUnitPrice,
      suggestedTotal: result.suggestedTotalPrice,
      firingCharge: result.firingCharge,
      profit: result.profitPerUnit,
      netMargin: result.netMargin,
      kilnUsePercent: Math.max(bisque.usePercent, glazeFiring.usePercent),
    };
  }, [f, defaults, firingSettings]);

  const save = useMutation({
    mutationFn: async () => {
      const p: any = {
        workspace_id: wsId,
        name: f.name,
        quantity: Math.max(1, Math.round(num(f.quantity))),
        height_cm: num(f.height_cm),
        length_cm: num(f.length_cm),
        depth_cm: num(f.depth_cm),
        clay_grams: num(f.clay_grams),
        clay_cost: breakdown.clayCost,
        glaze_grams: num(f.glaze_grams),
        glaze_cone: f.glaze_cone || "6",
        glaze_cost: breakdown.glazeCost,
        biscuit_cost: breakdown.biscuit,
        glaze_firing_cost: breakdown.glazeFiring,
        labor_cost: breakdown.labor,
        packaging_cost: breakdown.pack,
        other_cost: breakdown.other,
        customization_cost: breakdown.customization,
        fixed_allocation: breakdown.fixedAllocation,
        loss_percent: Number(defaults?.loss_percent ?? 0),
        payment_fee_percent: Number(defaults?.payment_fee_percent ?? 0),
        tax_percent: Number(defaults?.tax_percent ?? 0),
        expected_discount_percent: Number(defaults?.expected_discount_percent ?? 0),
        kiln_firing_profit_percent: Number(defaults?.kiln_firing_profit_percent ?? 100),
        net_profit: breakdown.profit,
        net_margin_percent: breakdown.netMargin * 100,
        total_cost: breakdown.total,
        margin_percent: num(f.margin_percent),
        suggested_price: breakdown.suggested,
        notes: f.notes || null,
      };
      const { error } = editId
        ? await sb.from("piece_pricing").update(p).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("piece_pricing").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["piece_pricing"] });
      setOpen(false);
      setEditId(null);
      setF(emptyF);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("piece_pricing")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["piece_pricing"] }),
  });

  const saveDefaults = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("piece_pricing_defaults").upsert({
        workspace_id: wsId,
        clay_kg_price: Number(d.clay_kg_price),
        glaze_gram_price: Number(d.glaze_gram_price),
        biscuit_coeff: Number(d.biscuit_coeff),
        glaze_firing_coeff: Number(d.glaze_firing_coeff),
        default_labor: Number(d.default_labor),
        default_packaging: Number(d.default_packaging),
        default_margin_percent: Number(d.default_margin_percent),
        kiln_firing_profit_percent: Number(d.kiln_firing_profit_percent || 0),
        loss_percent: Number(d.loss_percent || 0),
        payment_fee_percent: Number(d.payment_fee_percent || 0),
        tax_percent: Number(d.tax_percent || 0),
        expected_discount_percent: Number(d.expected_discount_percent || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["piece_pricing_defaults"] });
      setDefOpen(false);
      toast.success("Parâmetros salvos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(r: any) {
    setEditId(r.id);
    setF({
      name: r.name,
      quantity: String(r.quantity ?? 1),
      height_cm: String(r.height_cm),
      length_cm: String(r.length_cm),
      depth_cm: String(r.depth_cm),
      clay_grams: String(r.clay_grams),
      glaze_grams: String(r.glaze_grams),
      glaze_cone: String(r.glaze_cone ?? "6"),
      labor_cost: String(r.labor_cost),
      packaging_cost: String(r.packaging_cost),
      other_cost: String(r.other_cost),
      customization_cost: String(r.customization_cost ?? 0),
      fixed_allocation: String(r.fixed_allocation ?? 0),
      margin_percent: String(r.margin_percent),
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Precificação de Peças"
        helpKey="atelier.piece-pricing"
        description="Calculadora transparente de custo e preço"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDefOpen(true)}>
              <Settings2 className="w-4 h-4 mr-1" />
              Parâmetros
            </Button>
            <Button
              onClick={() => {
                setEditId(null);
                setF({
                  ...emptyF,
                  margin_percent: String(defaults?.default_margin_percent ?? 100),
                  labor_cost: String(defaults?.default_labor ?? 25),
                  packaging_cost: String(defaults?.default_packaging ?? 5),
                });
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Nova peça
            </Button>
          </div>
        }
      />

      {(rows?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Palette}
          title="Sem peças precificadas"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Nova peça
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows!.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.height_cm}×{r.length_cm}×{r.depth_cm} cm
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
                <div className="mt-3 space-y-1 text-xs">
                  <Row k="Argila" v={formatCurrency(Number(r.clay_cost), currency, privacy)} />
                  <Row k="Esmalte" v={formatCurrency(Number(r.glaze_cost), currency, privacy)} />
                  <Row k="Biscoito" v={formatCurrency(Number(r.biscuit_cost), currency, privacy)} />
                  <Row
                    k={`Vidrado cone ${r.glaze_cone ?? "6"}`}
                    v={formatCurrency(Number(r.glaze_firing_cost), currency, privacy)}
                  />
                  <Row
                    k="Mão de obra"
                    v={formatCurrency(Number(r.labor_cost), currency, privacy)}
                  />
                  <Row
                    k="Embalagem"
                    v={formatCurrency(Number(r.packaging_cost), currency, privacy)}
                  />
                  <Row k="Outros" v={formatCurrency(Number(r.other_cost), currency, privacy)} />
                  <div className="border-t border-border pt-1 mt-1">
                    <Row
                      k="Custo total"
                      v={formatCurrency(Number(r.total_cost), currency, privacy)}
                      bold
                    />
                  </div>
                  <Row k={`Margem ${r.margin_percent}%`} v="" />
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="text-xs text-muted-foreground">Preço sugerido</div>
                  <div className="font-mono text-2xl text-primary">
                    {formatCurrency(Number(r.suggested_price), currency, privacy)}
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
            <DialogTitle>{editId ? "Editar peça" : "Nova peça"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                value={f.quantity}
                onChange={(e) => setF({ ...f, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Altura (cm)</Label>
              <Input
                value={f.height_cm}
                onChange={(e) => setF({ ...f, height_cm: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comprimento/diâmetro (cm)</Label>
              <Input
                value={f.length_cm}
                onChange={(e) => setF({ ...f, length_cm: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Profundidade (cm)</Label>
              <Input
                value={f.depth_cm}
                onChange={(e) => setF({ ...f, depth_cm: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Argila (g)</Label>
              <Input
                value={f.clay_grams}
                onChange={(e) => setF({ ...f, clay_grams: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Esmalte (g)</Label>
              <Input
                value={f.glaze_grams}
                onChange={(e) => setF({ ...f, glaze_grams: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cone do esmalte</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={f.glaze_cone}
                onChange={(e) => setF({ ...f, glaze_cone: e.target.value })}
              >
                <option value="6">Cone 6</option>
                <option value="7">Cone 7</option>
                <option value="10">Cone 10</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Mão de obra</Label>
              <Input
                value={f.labor_cost}
                onChange={(e) => setF({ ...f, labor_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Embalagem</Label>
              <Input
                value={f.packaging_cost}
                onChange={(e) => setF({ ...f, packaging_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Outros custos</Label>
              <Input
                value={f.other_cost}
                onChange={(e) => setF({ ...f, other_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Personalização</Label>
              <Input
                value={f.customization_cost}
                onChange={(e) => setF({ ...f, customization_cost: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rateio fixo</Label>
              <Input
                value={f.fixed_allocation}
                onChange={(e) => setF({ ...f, fixed_allocation: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Margem (%)</Label>
              <Input
                value={f.margin_percent}
                onChange={(e) => setF({ ...f, margin_percent: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
          </div>
          <Card className="mt-3">
            <CardContent className="p-4 space-y-1 text-xs">
              <Row k="Custo argila" v={formatCurrency(breakdown.clayCost, currency, privacy)} />
              <Row k="Custo esmalte" v={formatCurrency(breakdown.glazeCost, currency, privacy)} />
              <Row k="Queima biscoito" v={formatCurrency(breakdown.biscuit, currency, privacy)} />
              <Row
                k="Queima vidrado"
                v={formatCurrency(breakdown.glazeFiring, currency, privacy)}
              />
              <Row k="Mão de obra" v={formatCurrency(breakdown.labor, currency, privacy)} />
              <Row k="Embalagem" v={formatCurrency(breakdown.pack, currency, privacy)} />
              <Row k="Outros" v={formatCurrency(breakdown.other, currency, privacy)} />
              <Row k="Personalização" v={formatCurrency(breakdown.customization, currency, privacy)} />
              <Row k="Rateio fixo" v={formatCurrency(breakdown.fixedAllocation, currency, privacy)} />
              <Row k="Perdas/retrabalho" v={formatCurrency(breakdown.losses, currency, privacy)} />
              <Row k="Queimas com margem" v={formatCurrency(breakdown.firingCharge, currency, privacy)} />
              <div className="border-t border-border pt-1">
                <Row k="Custo total" v={formatCurrency(breakdown.total, currency, privacy)} bold />
              </div>
              <div className="pt-1">
                <Row k="Preço sugerido unitário" v={formatCurrency(breakdown.suggested, currency, privacy)} bold />
                <Row k="Preço total" v={formatCurrency(breakdown.suggestedTotal, currency, privacy)} />
                <Row k="Uso estimado do forno" v={`${(breakdown.kilnUsePercent * 100).toFixed(2)}%`} />
                <Row k="Lucro líquido estimado" v={formatCurrency(breakdown.profit, currency, privacy)} />
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

      <Dialog open={defOpen} onOpenChange={setDefOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Parâmetros de precificação</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Argila R$/kg</Label>
              <Input
                value={d?.clay_kg_price ?? ""}
                onChange={(e) => setD({ ...d, clay_kg_price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Esmalte R$/g</Label>
              <Input
                value={d?.glaze_gram_price ?? ""}
                onChange={(e) => setD({ ...d, glaze_gram_price: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coef. biscoito</Label>
              <Input
                value={d?.biscuit_coeff ?? ""}
                onChange={(e) => setD({ ...d, biscuit_coeff: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coef. vidrado</Label>
              <Input
                value={d?.glaze_firing_coeff ?? ""}
                onChange={(e) => setD({ ...d, glaze_firing_coeff: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mão de obra padrão</Label>
              <Input
                value={d?.default_labor ?? ""}
                onChange={(e) => setD({ ...d, default_labor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Embalagem padrão</Label>
              <Input
                value={d?.default_packaging ?? ""}
                onChange={(e) => setD({ ...d, default_packaging: e.target.value })}
              />
            </div>
            <div className="space-y-1.5"><Label>Margem nas queimas (%)</Label><Input value={d?.kiln_firing_profit_percent ?? ""} onChange={(e) => setD({ ...d, kiln_firing_profit_percent: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Perdas esperadas (%)</Label><Input value={d?.loss_percent ?? ""} onChange={(e) => setD({ ...d, loss_percent: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Taxa de pagamento (%)</Label><Input value={d?.payment_fee_percent ?? ""} onChange={(e) => setD({ ...d, payment_fee_percent: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Impostos (%)</Label><Input value={d?.tax_percent ?? ""} onChange={(e) => setD({ ...d, tax_percent: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Desconto esperado (%)</Label><Input value={d?.expected_discount_percent ?? ""} onChange={(e) => setD({ ...d, expected_discount_percent: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2">
              <Label>Margem padrão (%)</Label>
              <Input
                value={d?.default_margin_percent ?? ""}
                onChange={(e) => setD({ ...d, default_margin_percent: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveDefaults.mutate()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
