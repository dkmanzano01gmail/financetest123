import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Gauge, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/kilns")({ component: Page });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const empty = () => ({
  name: "",
  brand: "",
  model: "",
  serial_number: "",
  power_kw: "0",
  kwh_cost: "0",
  oven_diameter_cm: "0",
  resistance_cost: "0",
  resistance_burns: "0",
  utilization: "0",
  area_adjustment: "0",
  final_buffer: "0",
  customer_margin_percent: "0",
  biscuit_hours: "0",
  glaze_hours: "0",
  is_active: true,
  is_default: false,
  notes: "",
});

type FormState = ReturnType<typeof empty>;

const numericFields: (keyof FormState)[] = [
  "power_kw",
  "kwh_cost",
  "oven_diameter_cm",
  "resistance_cost",
  "resistance_burns",
  "utilization",
  "area_adjustment",
  "final_buffer",
  "customer_margin_percent",
  "biscuit_hours",
  "glaze_hours",
];

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty());

  const { data: items = [] } = useQuery({
    queryKey: ["kilns", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("kilns")
        .select("*")
        .eq("workspace_id", wsId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.filter((item: any) =>
      [item.name, item.brand, item.model, item.serial_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do forno.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        workspace_id: wsId,
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        serial_number: form.serial_number.trim() || null,
        is_active: form.is_active,
        is_default: form.is_default,
        notes: form.notes.trim() || null,
      };
      for (const field of numericFields) {
        const value = parseLocaleAmount(String(form[field]));
        if (!Number.isFinite(value)) throw new Error("Revise os valores numéricos.");
        payload[field] = value;
      }
      const { error } = editId
        ? await sb.from("kilns").update(payload).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("kilns").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kilns"] });
      setOpen(false);
      setEditId(null);
      setForm(empty());
      toast.success("Forno salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("kilns")
        .update({ is_active: false })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kilns"] });
      toast.success("Forno inativado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function edit(item: any) {
    setEditId(item.id);
    setForm(
      Object.fromEntries(
        Object.keys(empty()).map((key) => [
          key,
          key === "is_active"
            ? item[key] !== false
            : key === "is_default"
              ? item[key] === true
              : item[key] == null
                ? ""
                : String(item[key]),
        ]),
      ) as FormState,
    );
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Fornos"
        description="Cadastro dos fornos e parâmetros usados no cálculo de queimas"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setForm(empty());
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo forno
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3">
          <Input
            className="max-w-xs"
            placeholder="Buscar forno, marca ou modelo"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Gauge} title="Nenhum forno cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filtered.map((item: any) => (
            <Card key={item.id} className={item.is_active === false ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[item.brand, item.model].filter(Boolean).join(" · ") || "Sem marca/modelo"}
                    </div>
                  </div>
                  {item.is_default && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      padrão
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Info label="Potência" value={`${item.power_kw} kW`} />
                  <Info
                    label="Custo kWh"
                    value={formatCurrency(Number(item.kwh_cost), currency, privacy)}
                  />
                  <Info label="Diâmetro" value={`${item.oven_diameter_cm} cm`} />
                  <Info
                    label="Resistências"
                    value={formatCurrency(Number(item.resistance_cost), currency, privacy)}
                  />
                  <Info label="Horas biscoito" value={`${item.biscuit_hours} h`} />
                  <Info label="Horas esmalte" value={`${item.glaze_hours} h`} />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(item)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar forno" : "Novo forno"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field
              label="Marca"
              value={form.brand}
              onChange={(v) => setForm({ ...form, brand: v })}
            />
            <Field
              label="Modelo"
              value={form.model}
              onChange={(v) => setForm({ ...form, model: v })}
            />
            <Field
              label="Número de série"
              value={form.serial_number}
              onChange={(v) => setForm({ ...form, serial_number: v })}
            />
            <Field
              label="Potência (kW)"
              value={form.power_kw}
              onChange={(v) => setForm({ ...form, power_kw: v })}
            />
            <Field
              label="Custo do kWh"
              value={form.kwh_cost}
              onChange={(v) => setForm({ ...form, kwh_cost: v })}
            />
            <Field
              label="Diâmetro (cm)"
              value={form.oven_diameter_cm}
              onChange={(v) => setForm({ ...form, oven_diameter_cm: v })}
            />
            <Field
              label="Custo das resistências"
              value={form.resistance_cost}
              onChange={(v) => setForm({ ...form, resistance_cost: v })}
            />
            <Field
              label="Queimas por resistência"
              value={form.resistance_burns}
              onChange={(v) => setForm({ ...form, resistance_burns: v })}
            />
            <Field
              label="Aproveitamento"
              value={form.utilization}
              onChange={(v) => setForm({ ...form, utilization: v })}
            />
            <Field
              label="Ajuste de área"
              value={form.area_adjustment}
              onChange={(v) => setForm({ ...form, area_adjustment: v })}
            />
            <Field
              label="Buffer final"
              value={form.final_buffer}
              onChange={(v) => setForm({ ...form, final_buffer: v })}
            />
            <Field
              label="Margem cliente (%)"
              value={form.customer_margin_percent}
              onChange={(v) => setForm({ ...form, customer_margin_percent: v })}
            />
            <Field
              label="Horas biscoito"
              value={form.biscuit_hours}
              onChange={(v) => setForm({ ...form, biscuit_hours: v })}
            />
            <Field
              label="Horas esmalte"
              value={form.glaze_hours}
              onChange={(v) => setForm({ ...form, glaze_hours: v })}
            />
            <Field
              label="Observações"
              value={form.notes}
              onChange={(v) => setForm({ ...form, notes: v })}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label>Ativo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_default}
                onCheckedChange={(v) => setForm({ ...form, is_default: v })}
              />
              <Label>Forno padrão</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}
