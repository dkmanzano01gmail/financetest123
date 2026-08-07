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
import { FileUp, Gauge, Loader2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeKilnManual, type ManualField } from "@/lib/kiln-manual.functions";

const MANUAL_LABELS: Record<string, string> = {
  brand: "Marca",
  model: "Modelo",
  name: "Nome",
  power_kw: "Potência (kW)",
  oven_diameter_cm: "Diâmetro (cm)",
  biscuit_hours: "Horas biscoito",
  glaze_hours: "Horas esmalte",
  kwh_cost: "Custo do kWh",
  resistance_cost: "Custo das resistências",
  resistance_burns: "Queimas por resistência",
  utilization: "Aproveitamento",
  area_adjustment: "Ajuste de área",
  final_buffer: "Buffer final",
  customer_margin_percent: "Margem cliente (%)",
};

const COMMERCIAL_FIELDS = [
  "kwh_cost",
  "resistance_cost",
  "resistance_burns",
  "utilization",
  "area_adjustment",
  "final_buffer",
  "customer_margin_percent",
];

const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [manualFields, setManualFields] = useState<Record<string, ManualField>>({});
  const [manualBefore, setManualBefore] = useState<FormState | null>(null);

  function resetManual() {
    setManualFile(null);
    setManualFields({});
    setManualBefore(null);
    setDragging(false);
  }

  function pickManualFile(file: File | null | undefined) {
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error("Formato não suportado. Envie PDF, PNG, JPG/JPEG ou WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo acima do limite de 20 MB.");
      return;
    }
    setManualFile(file);
  }

  const analyze = useMutation({
    mutationFn: async () => {
      if (!manualFile) throw new Error("Selecione o manual primeiro.");
      const dataBase64 = await fileToBase64(manualFile);
      return analyzeKilnManual({
        data: { fileName: manualFile.name, mimeType: manualFile.type, dataBase64 },
      });
    },
    onSuccess: (result) => {
      const fields = result.fields ?? {};
      const keys = Object.keys(fields);
      if (keys.length === 0) {
        toast.error("Nenhum parâmetro explícito foi encontrado no manual.");
        setManualFields({});
        return;
      }
      setManualBefore((prev) => prev ?? form);
      setForm((prev) => {
        const next = { ...prev };
        for (const key of keys) {
          const value = fields[key]?.value;
          if (value === null || value === undefined) continue;
          if (key in next) (next as Record<string, unknown>)[key] = String(value);
        }
        return next;
      });
      setManualFields(fields);
      toast.success(`${keys.length} campos encontrados — revise e clique em Salvar.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function undoManual() {
    if (manualBefore) setForm(manualBefore);
    setManualBefore(null);
    setManualFields({});
    toast.success("Valores do manual desfeitos.");
  }

  const manualKeys = Object.keys(manualFields);
  const pendingManualFields = COMMERCIAL_FIELDS.filter((k) => !manualKeys.includes(k));

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
      resetManual();
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
    resetManual();
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
              resetManual();
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetManual();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar forno" : "Novo forno"}</DialogTitle>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Preencher pelo manual</div>
                <p className="text-xs text-muted-foreground">
                  Envie o manual (PDF, PNG, JPG ou WebP, até 20 MB). O arquivo é usado apenas para
                  a análise e não fica armazenado.
                </p>
              </div>
              {manualKeys.length > 0 && (
                <Button size="sm" variant="ghost" onClick={undoManual}>
                  <Undo2 className="mr-1 h-4 w-4" /> Desfazer
                </Button>
              )}
            </div>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickManualFile(e.dataTransfer.files?.[0]);
              }}
              className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-xs transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30"
              }`}
            >
              <FileUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                Clique para escolher ou arraste o arquivo aqui
              </span>
              {manualFile && <span className="font-medium">{manualFile.name}</span>}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                onChange={(e) => pickManualFile(e.target.files?.[0])}
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => analyze.mutate()}
                disabled={!manualFile || analyze.isPending}
              >
                {analyze.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {analyze.isPending ? "Analisando manual…" : "Analisar manual"}
              </Button>
              {manualKeys.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {manualKeys.length} campos encontrados · revise antes de salvar
                </span>
              )}
            </div>

            {manualKeys.length > 0 && (
              <div className="mt-3 space-y-1 text-xs">
                {manualKeys.map((key) => (
                  <div key={key} className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {MANUAL_LABELS[key] ?? key}:
                    </span>{" "}
                    {String(manualFields[key]?.value ?? "")}
                    {manualFields[key]?.confidence != null &&
                      ` · confiança ${Math.round((manualFields[key]!.confidence as number) * 100)}%`}
                    {manualFields[key]?.evidence && ` · “${manualFields[key]!.evidence}”`}
                    {manualFields[key]?.page != null && ` (p. ${manualFields[key]!.page})`}
                  </div>
                ))}
                {pendingManualFields.length > 0 && (
                  <p className="pt-1 text-muted-foreground">
                    Permanecem manuais:{" "}
                    {pendingManualFields.map((k) => MANUAL_LABELS[k]).join(", ")}.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Nome"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              highlight={!!manualFields.name}
            />
            <Field
              label="Marca"
              value={form.brand}
              onChange={(v) => setForm({ ...form, brand: v })}
              highlight={!!manualFields.brand}
            />
            <Field
              label="Modelo"
              value={form.model}
              onChange={(v) => setForm({ ...form, model: v })}
              highlight={!!manualFields.model}
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
              highlight={!!manualFields.power_kw}
            />
            <Field
              label="Custo do kWh"
              value={form.kwh_cost}
              onChange={(v) => setForm({ ...form, kwh_cost: v })}
              highlight={!!manualFields.kwh_cost}
            />
            <Field
              label="Diâmetro (cm)"
              value={form.oven_diameter_cm}
              onChange={(v) => setForm({ ...form, oven_diameter_cm: v })}
              highlight={!!manualFields.oven_diameter_cm}
            />
            <Field
              label="Custo das resistências"
              value={form.resistance_cost}
              onChange={(v) => setForm({ ...form, resistance_cost: v })}
              highlight={!!manualFields.resistance_cost}
            />
            <Field
              label="Queimas por resistência"
              value={form.resistance_burns}
              onChange={(v) => setForm({ ...form, resistance_burns: v })}
              highlight={!!manualFields.resistance_burns}
            />
            <Field
              label="Aproveitamento"
              value={form.utilization}
              onChange={(v) => setForm({ ...form, utilization: v })}
              highlight={!!manualFields.utilization}
            />
            <Field
              label="Ajuste de área"
              value={form.area_adjustment}
              onChange={(v) => setForm({ ...form, area_adjustment: v })}
              highlight={!!manualFields.area_adjustment}
            />
            <Field
              label="Buffer final"
              value={form.final_buffer}
              onChange={(v) => setForm({ ...form, final_buffer: v })}
              highlight={!!manualFields.final_buffer}
            />
            <Field
              label="Margem cliente (%)"
              value={form.customer_margin_percent}
              onChange={(v) => setForm({ ...form, customer_margin_percent: v })}
              highlight={!!manualFields.customer_margin_percent}
            />
            <Field
              label="Horas biscoito"
              value={form.biscuit_hours}
              onChange={(v) => setForm({ ...form, biscuit_hours: v })}
              highlight={!!manualFields.biscuit_hours}
            />
            <Field
              label="Horas esmalte"
              value={form.glaze_hours}
              onChange={(v) => setForm({ ...form, glaze_hours: v })}
              highlight={!!manualFields.glaze_hours}
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
  highlight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {highlight && <span className="ml-1 text-primary">· do manual</span>}
      </Label>
      <Input
        className={highlight ? "border-primary bg-primary/5" : ""}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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
