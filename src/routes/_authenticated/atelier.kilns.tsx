import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { calculateKilnCost, resolveFiringProfile } from "@/lib/orna-logic";
import { Flame, Gauge, Pencil, Plus, Star, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/kilns")({ component: Page });
const sb = supabase as any;

const defaults = () => ({
  name: "",
  brand: "",
  model: "",
  serial_number: "",
  notes: "",
  is_active: true,
  is_default: false,
  oven_diameter_cm: "57",
  area_adjustment: "1.0825",
  resistance_cost: "2000",
  resistance_burns: "275",
  power_kw: "9.85",
  biscuit_hours: "9",
  glaze_hours: "10.5",
  utilization: "0.65",
  kwh_cost: "1",
  final_buffer: "0.1",
  customer_margin_percent: "100",
  biscuit_resistance_burns: "275",
  biscuit_utilization: "0.65",
  glaze6_resistance_burns: "175",
  glaze6_hours: "10.5",
  glaze6_utilization: "0.75",
  glaze7_resistance_burns: "150",
  glaze7_hours: "11",
  glaze7_utilization: "0.78",
  glaze10_resistance_burns: "110",
  glaze10_hours: "12",
  glaze10_utilization: "0.9",
});

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaults());

  const { data: kilns = [], isLoading, error } = useQuery({
    queryKey: ["kilns", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("kilns")
        .select("*")
        .eq("workspace_id", wsId)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do forno.");
      if (form.is_default) {
        const { error } = await sb
          .from("kilns")
          .update({ is_default: false })
          .eq("workspace_id", wsId)
          .neq("id", editId || "00000000-0000-0000-0000-000000000000");
        if (error) throw error;
      }
      const payload: any = { workspace_id: wsId };
      for (const [key, value] of Object.entries(form)) {
        payload[key] =
          ["name", "brand", "model", "serial_number", "notes"].includes(key)
            ? String(value).trim() || null
            : ["is_active", "is_default"].includes(key)
              ? value
              : Number(value);
      }
      payload.name = form.name.trim();
      if ((kilns as any[]).length === 0) payload.is_default = true;
      const { error } = editId
        ? await sb.from("kilns").update(payload).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("kilns").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kilns"] });
      setOpen(false);
      setEditId(null);
      setForm(defaults());
      toast.success("Forno e parâmetros salvos");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const makeDefault = useMutation({
    mutationFn: async (kiln: any) => {
      const { error: clearError } = await sb
        .from("kilns")
        .update({ is_default: false })
        .eq("workspace_id", wsId);
      if (clearError) throw clearError;
      const { error } = await sb
        .from("kilns")
        .update({ is_default: true, is_active: true })
        .eq("id", kiln.id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kilns"] });
      toast.success("Forno padrão atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(kiln: any) {
    const next: any = defaults();
    for (const key of Object.keys(next)) {
      next[key] = typeof next[key] === "boolean" ? !!kiln[key] : String(kiln[key] ?? "");
    }
    setEditId(kiln.id);
    setForm(next);
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Fornos"
        description="Cadastre cada forno e os parâmetros que formam o custo de suas queimas"
        action={
          <Button onClick={() => { setEditId(null); setForm(defaults()); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />Novo forno
          </Button>
        }
      />

      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-3">
          <div className="flex gap-2"><Gauge className="h-5 w-5 text-primary" /><span><strong>Dimensão e ocupação</strong><br /><span className="text-muted-foreground">Definem quanto da área útil cada peça consome.</span></span></div>
          <div className="flex gap-2"><Zap className="h-5 w-5 text-primary" /><span><strong>Energia e resistência</strong><br /><span className="text-muted-foreground">Calculam o custo real de cada ciclo.</span></span></div>
          <div className="flex gap-2"><Flame className="h-5 w-5 text-primary" /><span><strong>Perfis por cone</strong><br /><span className="text-muted-foreground">Ajustam horas e desgaste para cada temperatura.</span></span></div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive">Erro ao carregar: {(error as Error).message}</div>
      ) : (kilns as any[]).length === 0 ? (
        <EmptyState
          icon={Flame}
          title="Nenhum forno cadastrado"
          description="Cadastre o primeiro forno para usar os parâmetros nas peças e nas queimas."
          action={<Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Cadastrar forno</Button>}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(kilns as any[]).map((kiln) => (
            <KilnCard
              key={kiln.id}
              kiln={kiln}
              onEdit={() => edit(kiln)}
              onMakeDefault={() => makeDefault.mutate(kiln)}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editId ? "Editar forno" : "Cadastrar forno"}</DialogTitle></DialogHeader>
          <Section title="Identificação">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome do forno"><Input placeholder="Ex.: Forno grande" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Marca"><Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
              <Field label="Modelo"><Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
              <Field label="Número de série"><Input value={form.serial_number} onChange={(event) => setForm({ ...form, serial_number: event.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="Notas"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} /><Label>Forno ativo</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_default} onCheckedChange={(value) => setForm({ ...form, is_default: value })} /><Label>Usar como forno padrão</Label></div>
            </div>
          </Section>
          <Section title="Custos e capacidade">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberField label="Diâmetro útil (cm)" field="oven_diameter_cm" form={form} setForm={setForm} />
              <NumberField label="Fator de área" field="area_adjustment" form={form} setForm={setForm} />
              <NumberField label="Potência (kW)" field="power_kw" form={form} setForm={setForm} />
              <NumberField label="Custo do kWh" field="kwh_cost" form={form} setForm={setForm} />
              <NumberField label="Custo da resistência" field="resistance_cost" form={form} setForm={setForm} />
              <NumberField label="Buffer final (0–1)" field="final_buffer" form={form} setForm={setForm} />
              <NumberField label="Margem de cobrança (%)" field="customer_margin_percent" form={form} setForm={setForm} />
            </div>
          </Section>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProfileSection title="Biscoito" prefix="biscuit" form={form} setForm={setForm} />
            <ProfileSection title="Esmalte · cone 6" prefix="glaze6" form={form} setForm={setForm} />
            <ProfileSection title="Esmalte · cone 7" prefix="glaze7" form={form} setForm={setForm} />
            <ProfileSection title="Esmalte · cone 10" prefix="glaze10" form={form} setForm={setForm} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>Salvar forno</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function KilnCard({ kiln, onEdit, onMakeDefault }: { kiln: any; onEdit: () => void; onMakeDefault: () => void }) {
  const preview = useMemo(() => {
    const profile = resolveFiringProfile(kiln, "biscuit", "Biscoito");
    return calculateKilnCost({
      lengthCm: 10,
      depthCm: 10,
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
  }, [kiln]);
  return (
    <Card className={!kiln.is_active ? "opacity-65" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{kiln.name}</span>
              {kiln.is_default && <Badge><Star className="mr-1 h-3 w-3" />Padrão</Badge>}
              {!kiln.is_active && <Badge variant="secondary">Inativo</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">{[kiln.brand, kiln.model].filter(Boolean).join(" · ") || "Marca/modelo não informado"}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Value label="Diâmetro útil" value={`${Number(kiln.oven_diameter_cm).toLocaleString("pt-BR")} cm`} />
          <Value label="Potência" value={`${Number(kiln.power_kw).toLocaleString("pt-BR")} kW`} />
          <Value label="kWh" value={`R$ ${Number(kiln.kwh_cost).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
        </div>
        <div className="mt-3 rounded-md bg-muted/45 p-3 text-xs text-muted-foreground">
          Referência rápida: uma peça de 10 × 10 cm ocupa {(preview.usePercent * 100).toFixed(2)}% e custa R$ {preview.unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} na queima de biscoito.
        </div>
        {!kiln.is_default && kiln.is_active && <Button variant="outline" size="sm" className="mt-3" onClick={onMakeDefault}><Star className="mr-1 h-3.5 w-3.5" />Definir como padrão</Button>}
      </CardContent>
    </Card>
  );
}
function ProfileSection({ title, prefix, form, setForm }: { title: string; prefix: string; form: any; setForm: (value: any) => void }) {
  return <Section title={title}><div className="grid grid-cols-3 gap-2"><NumberField label="Queimas/resist." field={`${prefix}_resistance_burns`} form={form} setForm={setForm} /><NumberField label="Horas" field={`${prefix}_hours`} form={form} setForm={setForm} /><NumberField label="Uso potência" field={`${prefix}_utilization`} form={form} setForm={setForm} /></div></Section>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-lg border p-3"><div className="mb-3 text-sm font-semibold">{title}</div>{children}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function NumberField({ label, field, form, setForm }: { label: string; field: string; form: any; setForm: (value: any) => void }) {
  return <Field label={label}><Input inputMode="decimal" value={form[field] ?? ""} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></Field>;
}
function Value({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/45 p-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-mono text-sm">{value}</div></div>;
}
