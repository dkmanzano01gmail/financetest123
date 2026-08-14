import { createFileRoute, Link } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency } from "@/lib/format";
import { calculateKilnCost, resolveFiringProfile } from "@/lib/orna-logic";
import { Plus, Trash2, Pencil, Flame, Package, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/firing-pricing")({ component: Page });
const sb = supabase as any;
const num = (s: string) => Number((s ?? "").replace(",", ".") || 0);
const emptyFiring = {
  reference: "Yby 10Z2",
  firing_date: new Date().toISOString().slice(0, 10),
  firing_type: "biscuit",
  cone: "Biscoito",
  kiln_id: "",
  notes: "",
};
const emptyPiece = {
  customer_name: "",
  piece_name: "",
  height_cm: "0",
  length_cm: "0",
  depth_cm: "0",
  quantity: "1",
  charge_customer: false,
  charge_amount: "0",
};

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [firingOpen, setFiringOpen] = useState(false);
  const [firingEdit, setFiringEdit] = useState<string | null>(null);
  const [ff, setFf] = useState(emptyFiring);
  const [pieceOpen, setPieceOpen] = useState(false);
  const [pieceEdit, setPieceEdit] = useState<string | null>(null);
  const [pf, setPf] = useState(emptyPiece);
  const [activeFiring, setActiveFiring] = useState<string | null>(null);

  const { data: firings } = useQuery({
    queryKey: ["firings", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await sb
          .from("firing_pricing")
          .select("*")
          .eq("workspace_id", wsId)
          .order("firing_date", { ascending: false, nullsFirst: false })
      ).data ?? [],
  });
  const { data: pieces } = useQuery({
    queryKey: ["firing_pieces", activeFiring],
    enabled: !!activeFiring,
    queryFn: async () =>
      (await sb.from("firing_pieces").select("*").eq("firing_id", activeFiring).eq("workspace_id", wsId).order("created_at"))
        .data ?? [],
  });
  const { data: settings } = useQuery({
    queryKey: ["firing_settings", wsId],
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
        customer_margin_percent: 100,
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
  const { data: kilns = [] } = useQuery({
    queryKey: ["kilns", wsId, "firing-pricing"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("kilns")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeF = firings?.find((f: any) => f.id === activeFiring);
  const activeKiln =
    (kilns as any[]).find((kiln) => kiln.id === activeF?.kiln_id) ??
    (kilns as any[]).find((kiln) => kiln.is_default) ??
    (kilns as any[])[0] ??
    settings;
  const activeProfile = useMemo(
    () => resolveFiringProfile(activeKiln, activeF?.firing_type ?? "biscuit", activeF?.cone),
    [activeKiln, activeF?.firing_type, activeF?.cone],
  );
  const kilnResult = useMemo(
    () =>
      calculateKilnCost({
        lengthCm: num(pf.length_cm),
        depthCm: num(pf.depth_cm),
        ovenDiameter: activeProfile.ovenDiameter,
        areaAdjustment: activeProfile.areaAdjustment,
        resistanceCost: activeProfile.resistanceCost,
        resistanceBurns: activeProfile.resistanceBurns,
        powerKw: activeProfile.powerKw,
        hours: activeProfile.hours,
        utilization: activeProfile.utilization,
        kwhCost: activeProfile.kwhCost,
        finalBuffer: activeProfile.finalBuffer,
      }),
    [pf.length_cm, pf.depth_cm, activeProfile],
  );
  const pieceCost = kilnResult.unitCost * (Number(pf.quantity) || 1);
  const suggestedCharge =
    pieceCost * (1 + Number(activeKiln?.customer_margin_percent ?? 100) / 100);

  const totals = useMemo(() => {
    let internal = 0,
      charges = 0;
    for (const p of pieces ?? []) {
      internal += Number(p.internal_cost);
      charges += Number(p.charge_amount);
    }
    return { internal, charges, profit: charges - internal };
  }, [pieces]);

  const saveFiring = useMutation({
    mutationFn: async () => {
      const selectedKilnId =
        ff.kiln_id ||
        (kilns as any[]).find((kiln) => kiln.is_default)?.id ||
        (kilns as any[])[0]?.id ||
        null;
      const p: any = {
        workspace_id: wsId,
        reference: ff.reference,
        firing_date: ff.firing_date || null,
        firing_type: ff.firing_type,
        cone: ff.firing_type === "biscuit" ? "Biscoito" : ff.cone || "6",
        kiln_id: selectedKilnId,
        notes: ff.notes || null,
      };
      const { error } = firingEdit
        ? await sb.from("firing_pricing").update(p).eq("id", firingEdit).eq("workspace_id", wsId)
        : await sb.from("firing_pricing").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["firings"] });
      setFiringOpen(false);
      setFiringEdit(null);
      setFf(emptyFiring);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delFiring = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("firing_pricing")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["firings"] });
      setActiveFiring(null);
    },
  });

  async function syncFiringTotals(firingId: string | null) {
    if (!firingId) return;
    const { data: allPieces, error: readError } = await sb
      .from("firing_pieces")
      .select("internal_cost,charge_amount")
      .eq("firing_id", firingId)
      .eq("workspace_id", wsId);
    if (readError) throw readError;
    const totals = (allPieces ?? []).reduce(
      (acc: { internal: number; charges: number }, piece: any) => ({
        internal: acc.internal + Number(piece.internal_cost || 0),
        charges: acc.charges + Number(piece.charge_amount || 0),
      }),
      { internal: 0, charges: 0 },
    );
    const { error } = await sb
      .from("firing_pricing")
      .update({
        total_internal_cost: totals.internal,
        total_charges: totals.charges,
        profit: totals.charges - totals.internal,
      })
      .eq("id", firingId)
      .eq("workspace_id", wsId);
    if (error) throw error;
  }

  const savePiece = useMutation({
    mutationFn: async () => {
      const p: any = {
        workspace_id: wsId,
        firing_id: activeFiring,
        customer_name: pf.customer_name || null,
        piece_name: pf.piece_name,
        height_cm: num(pf.height_cm),
        length_cm: num(pf.length_cm),
        depth_cm: num(pf.depth_cm),
        quantity: Math.max(1, Math.round(num(pf.quantity))),
        internal_cost: pieceCost,
        charge_customer: pf.charge_customer,
        charge_amount: pf.charge_customer ? num(pf.charge_amount) || suggestedCharge : 0,
      };
      const { error } = pieceEdit
        ? await sb.from("firing_pieces").update(p).eq("id", pieceEdit).eq("workspace_id", wsId)
        : await sb.from("firing_pieces").insert(p);
      if (error) throw error;
      await syncFiringTotals(activeFiring);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["firing_pieces"] });
      qc.invalidateQueries({ queryKey: ["firings"] });
      setPieceOpen(false);
      setPieceEdit(null);
      setPf(emptyPiece);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delPiece = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("firing_pieces")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
      await syncFiringTotals(activeFiring);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["firing_pieces"] });
      qc.invalidateQueries({ queryKey: ["firings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function editFiring(r: any) {
    setFiringEdit(r.id);
    setFf({
      reference: r.reference,
      firing_date: r.firing_date ?? "",
      firing_type: r.firing_type,
      cone: r.cone ?? (r.firing_type === "biscuit" ? "Biscoito" : "6"),
      kiln_id: r.kiln_id ?? "",
      notes: r.notes ?? "",
    });
    setFiringOpen(true);
  }
  function editPiece(p: any) {
    setPieceEdit(p.id);
    setPf({
      customer_name: p.customer_name ?? "",
      piece_name: p.piece_name,
      height_cm: String(p.height_cm),
      length_cm: String(p.length_cm),
      depth_cm: String(p.depth_cm),
      quantity: String(p.quantity),
      charge_customer: p.charge_customer,
      charge_amount: String(p.charge_amount),
    });
    setPieceOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Precificação de Queimas"
        helpKey="atelier.firing-pricing"
        description="Custo por queima e cobrança de clientes/alunos"
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/atelier/kilns"><Settings2 className="w-4 h-4 mr-1" />Gerenciar fornos</Link>
            </Button>
            <Button onClick={() => { setFiringEdit(null); setFf(emptyFiring); setFiringOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" />Nova queima
            </Button>
          </div>
        }
      />

      {(firings?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Flame}
          title="Sem queimas registradas"
          action={
            <Button onClick={() => setFiringOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Nova queima
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="space-y-2 lg:col-span-1">
            {firings!.map((r: any) => (
              <Card
                key={r.id}
                className={`cursor-pointer transition ${activeFiring === r.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setActiveFiring(r.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">
                        {r.reference} ·{" "}
                        <span className="text-xs text-muted-foreground">
                          {r.firing_type === "biscuit" ? "Biscoito" : `Vidrado cone ${r.cone || "6"}`}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {r.firing_date ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(kilns as any[]).find((kiln) => kiln.id === r.kiln_id)?.name || "Forno padrão legado"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          editFiring(r);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          delFiring.mutate(r.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs flex justify-between font-mono">
                    <span className="text-expense">
                      {formatCurrency(Number(r.total_internal_cost), currency, privacy)}
                    </span>
                    <span className="text-income">
                      {formatCurrency(Number(r.total_charges), currency, privacy)}
                    </span>
                    <span>{formatCurrency(Number(r.profit), currency, privacy)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="lg:col-span-2">
            {!activeFiring ? (
              <EmptyState icon={Package} title="Selecione uma queima para ver as peças" />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <div className="font-medium">Peças da queima</div>
                      <div className="text-xs text-muted-foreground">
                        Custo por ocupação do forno: energia + resistência + buffer
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setPieceEdit(null);
                        setPf(emptyPiece);
                        setPieceOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Peça
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Custo interno</div>
                      <div className="font-mono text-expense">
                        {formatCurrency(totals.internal, currency, privacy)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Cobrado</div>
                      <div className="font-mono text-income">
                        {formatCurrency(totals.charges, currency, privacy)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Lucro</div>
                      <div className="font-mono">
                        {formatCurrency(totals.profit, currency, privacy)}
                      </div>
                    </div>
                  </div>
                  {(pieces?.length ?? 0) === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">Sem peças</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr className="text-left">
                            <th className="p-2">Cliente</th>
                            <th className="p-2">Peça</th>
                            <th className="p-2">Dim (cm)</th>
                            <th className="p-2 text-right">Qtd</th>
                            <th className="p-2 text-right">Custo</th>
                            <th className="p-2 text-right">Cobrança</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pieces!.map((p: any) => (
                            <tr key={p.id} className="border-t border-border">
                              <td className="p-2">{p.customer_name ?? "—"}</td>
                              <td className="p-2">{p.piece_name}</td>
                              <td className="p-2 font-mono text-xs">
                                {p.height_cm}×{p.length_cm}×{p.depth_cm}
                              </td>
                              <td className="p-2 text-right font-mono">{p.quantity}</td>
                              <td className="p-2 text-right font-mono">
                                {formatCurrency(Number(p.internal_cost), currency, privacy)}
                              </td>
                              <td className="p-2 text-right font-mono">
                                {p.charge_customer
                                  ? formatCurrency(Number(p.charge_amount), currency, privacy)
                                  : "—"}
                              </td>
                              <td className="p-2 flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" onClick={() => editPiece(p)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => delPiece.mutate(p.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={firingOpen} onOpenChange={setFiringOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{firingEdit ? "Editar queima" : "Nova queima"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Referência da queima</Label>
              <Input
                value={ff.reference}
                onChange={(e) => setFf({ ...ff, reference: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Forno</Label>
              <Select
                value={ff.kiln_id || (kilns as any[]).find((kiln) => kiln.is_default)?.id || (kilns as any[])[0]?.id || "legacy"}
                onValueChange={(value) => setFf({ ...ff, kiln_id: value === "legacy" ? "" : value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(kilns as any[]).length === 0 && <SelectItem value="legacy">Parâmetros antigos</SelectItem>}
                  {(kilns as any[]).map((kiln) => <SelectItem key={kiln.id} value={kiln.id}>{kiln.name}{kiln.is_default ? " · padrão" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              {(kilns as any[]).length === 0 && <div className="text-xs text-muted-foreground">Cadastre um forno na nova aba Fornos para calcular com parâmetros específicos.</div>}
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={ff.firing_date}
                onChange={(e) => setFf({ ...ff, firing_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={ff.firing_type}
                onValueChange={(v) =>
                  setFf({
                    ...ff,
                    firing_type: v,
                    cone: v === "biscuit" ? "Biscoito" : ff.cone === "Biscoito" ? "6" : ff.cone,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biscuit">Biscoito</SelectItem>
                  <SelectItem value="glaze">Vidrado</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ff.firing_type !== "biscuit" && (
              <div className="space-y-1.5 col-span-2">
                <Label>Cone</Label>
                <Select value={ff.cone || "6"} onValueChange={(v) => setFf({ ...ff, cone: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Cone 6</SelectItem>
                    <SelectItem value="7">Cone 7</SelectItem>
                    <SelectItem value="10">Cone 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={ff.notes} onChange={(e) => setFf({ ...ff, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFiringOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveFiring.mutate()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pieceOpen} onOpenChange={setPieceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{pieceEdit ? "Editar peça" : "Nova peça"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cliente/aluno</Label>
              <Input
                value={pf.customer_name}
                onChange={(e) => setPf({ ...pf, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Peça</Label>
              <Input
                value={pf.piece_name}
                onChange={(e) => setPf({ ...pf, piece_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Altura</Label>
              <Input
                value={pf.height_cm}
                onChange={(e) => setPf({ ...pf, height_cm: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comp/diâm</Label>
              <Input
                value={pf.length_cm}
                onChange={(e) => setPf({ ...pf, length_cm: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Profundidade</Label>
              <Input
                value={pf.depth_cm}
                onChange={(e) => setPf({ ...pf, depth_cm: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                value={pf.quantity}
                onChange={(e) => setPf({ ...pf, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={pf.charge_customer}
                onChange={(e) => setPf({ ...pf, charge_customer: e.target.checked })}
                id="cc"
              />
              <Label htmlFor="cc">Cobrar do cliente</Label>
            </div>
            {pf.charge_customer && (
              <div className="space-y-1.5 col-span-2">
                <Label>Valor cobrado</Label>
                <Input
                  value={pf.charge_amount}
                  onChange={(e) => setPf({ ...pf, charge_amount: e.target.value })}
                />
              </div>
            )}
          </div>
          <Card><CardContent className="p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Uso estimado do forno</span><span className="font-mono">{(kilnResult.usePercent * 100).toFixed(2)}%</span></div>
            <div className="flex justify-between"><span>Energia</span><span className="font-mono">{formatCurrency(kilnResult.energyCost * (Number(pf.quantity) || 1), currency, privacy)}</span></div>
            <div className="flex justify-between"><span>Resistência</span><span className="font-mono">{formatCurrency(kilnResult.resistanceCost * (Number(pf.quantity) || 1), currency, privacy)}</span></div>
            <div className="flex justify-between font-semibold"><span>Custo interno</span><span className="font-mono">{formatCurrency(pieceCost, currency, privacy)}</span></div>
            <div className="flex justify-between text-income"><span>Cobrança sugerida</span><span className="font-mono">{formatCurrency(suggestedCharge, currency, privacy)}</span></div>
          </CardContent></Card>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPieceOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => savePiece.mutate()}
              disabled={savePiece.isPending || !pf.piece_name}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
