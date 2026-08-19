import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, parseLocaleAmount } from "@/lib/format";
import { AlertTriangle, ExternalLink, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/raw-materials")({ component: Page });
const sb = supabase as any;
const empty = () => ({
  name: "",
  material_type: "Argila",
  supplier: "",
  supplier_url: "",
  purchase_link: "",
  unit: "kg",
  quantity_purchased: "0",
  quantity_available: "0",
  unit_cost: "0",
  purchase_date: "",
  expiration_date: "",
  min_stock: "0",
  temperature_min_c: "",
  temperature_max_c: "",
  recommended_cone: "",
  max_cone: "",
  use_case: "",
  color: "",
  finish: "",
  compatibility: "",
  batch: "",
  stock_location: "",
  sku: "",
  is_active: true,
  notes: "",
});

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("active");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());

  const { data: items = [] } = useQuery({
    queryKey: ["raw_materials", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb.from("raw_materials").select("*").eq("workspace_id", wsId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => items.filter((item: any) => {
    if (stockFilter === "active" && item.is_active === false) return false;
    if (stockFilter === "low" && !(Number(item.min_stock) > 0 && Number(item.quantity_available) <= Number(item.min_stock))) return false;
    if (typeFilter !== "all" && item.material_type !== typeFilter) return false;
    if (query) {
      const haystack = [item.name, item.material_type, item.supplier, item.sku, item.color, item.finish, item.use_case].join(" ").toLowerCase();
      if (!haystack.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [items, stockFilter, typeFilter, query]);
  const summary = useMemo(() => items.reduce((acc: { active: number; low: number; expired: number; value: number }, item: any) => {
    const quantity = Number(item.quantity_available || 0);
    const cost = Number(item.unit_cost || 0);
    acc.value += quantity * cost;
    if (item.is_active !== false) acc.active += 1;
    if (Number(item.min_stock) > 0 && quantity <= Number(item.min_stock)) acc.low += 1;
    if (item.expiration_date && item.expiration_date <= new Date().toISOString().slice(0, 10)) acc.expired += 1;
    return acc;
  }, { active: 0, low: 0, expired: 0, value: 0 }), [items]);
  const types = useMemo<string[]>(() => Array.from(new Set((items as any[]).map((item: any) => String(item.material_type ?? "")).filter(Boolean))).sort(), [items]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome.");
      const quantityPurchased = parseLocaleAmount(form.quantity_purchased);
      const quantityAvailable = parseLocaleAmount(form.quantity_available);
      const unitCost = parseLocaleAmount(form.unit_cost);
      const minStock = parseLocaleAmount(form.min_stock);
      if (![quantityPurchased, quantityAvailable, unitCost, minStock].every(Number.isFinite)) throw new Error("Revise quantidades e custos.");
      const payload = {
        workspace_id: wsId,
        name: form.name.trim(),
        material_type: form.material_type || null,
        supplier: form.supplier.trim() || null,
        supplier_url: form.supplier_url.trim() || null,
        purchase_link: form.purchase_link.trim() || null,
        unit: form.unit.trim() || "un",
        quantity_purchased: quantityPurchased,
        quantity_available: quantityAvailable,
        unit_cost: unitCost,
        purchase_date: form.purchase_date || null,
        expiration_date: form.expiration_date || null,
        min_stock: minStock,
        temperature_min_c: form.temperature_min_c ? Number(form.temperature_min_c) : null,
        temperature_max_c: form.temperature_max_c ? Number(form.temperature_max_c) : null,
        recommended_cone: form.recommended_cone || null,
        max_cone: form.max_cone || null,
        use_case: form.use_case || null,
        color: form.color || null,
        finish: form.finish || null,
        compatibility: form.compatibility || null,
        batch: form.batch || null,
        stock_location: form.stock_location || null,
        sku: form.sku || null,
        is_active: form.is_active,
        notes: form.notes || null,
      };
      const { error } = editId
        ? await sb.from("raw_materials").update(payload).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("raw_materials").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw_materials"] }); setOpen(false); setEditId(null); setForm(empty()); toast.success("Matéria-prima salva"); },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("raw_materials")
        .update({ is_active: false })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["raw_materials"] }); toast.success("Matéria-prima inativada"); },
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(item: any) {
    setEditId(item.id);
    setForm(Object.fromEntries(Object.keys(empty()).map((key) => [key, key === "is_active" ? item[key] !== false : item[key] == null ? "" : String(item[key])])) as ReturnType<typeof empty>);
    setOpen(true);
  }

  return <PageContainer>
    <PageHeader title="Matéria-prima" helpKey="atelier.raw-materials" description="Estoque, custo, fornecedor e compatibilidade técnica" action={<Button onClick={() => { setEditId(null); setForm(empty()); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Novo material</Button>} />
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Materiais ativos" value={String(summary.active)} /><Stat label="Estoque baixo" value={String(summary.low)} tone={summary.low ? "expense" : undefined} /><Stat label="Vencidos" value={String(summary.expired)} tone={summary.expired ? "expense" : undefined} /><Stat label="Valor do estoque" value={formatCurrency(summary.value, currency, privacy)} /></div>
    <Card className="mb-4"><CardContent className="flex flex-wrap gap-2 p-3"><Input className="max-w-xs" placeholder="Buscar material, fornecedor ou SKU" value={query} onChange={(event) => setQuery(event.target.value)} /><Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{types.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><Select value={stockFilter} onValueChange={setStockFilter}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Ativos</SelectItem><SelectItem value="low">Estoque baixo</SelectItem><SelectItem value="all">Ativos e inativos</SelectItem></SelectContent></Select></CardContent></Card>
    {filtered.length === 0 ? <EmptyState icon={Package} title="Sem materiais encontrados" /> : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item: any) => {
      const low = Number(item.min_stock) > 0 && Number(item.quantity_available) <= Number(item.min_stock);
      return <Card key={item.id} className={item.is_active === false ? "opacity-60" : ""}><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.material_type ?? "—"} · {item.supplier ?? "Sem fornecedor"}</div></div>{low && <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"><AlertTriangle className="h-3 w-3" />baixo</span>}</div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Info label="Disponível" value={`${item.quantity_available} ${item.unit}`} /><Info label="Custo/un." value={formatCurrency(Number(item.unit_cost), currency, privacy)} /><Info label="Estoque mínimo" value={`${item.min_stock} ${item.unit}`} /><Info label="Valor atual" value={formatCurrency(Number(item.quantity_available) * Number(item.unit_cost), currency, privacy)} /><Info label="Cone/faixa" value={[item.recommended_cone, item.temperature_min_c && item.temperature_max_c ? `${item.temperature_min_c}–${item.temperature_max_c}°C` : ""].filter(Boolean).join(" · ") || "—"} /><Info label="Local" value={item.stock_location || "—"} /></div>{(item.purchase_link || item.supplier_url) && <a className="mt-3 inline-flex items-center gap-1 text-xs text-primary" href={item.purchase_link || item.supplier_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Abrir fornecedor/produto</a>}<div className="mt-2 flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => edit(item)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button></div></CardContent></Card>;
    })}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editId ? "Editar matéria-prima" : "Nova matéria-prima"}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3">
      <Field className="col-span-2" label="Nome"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Tipo"><Input value={form.material_type} onChange={(event) => setForm({ ...form, material_type: event.target.value })} /></Field><Field label="SKU"><Input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></Field>
      <Field label="Fornecedor"><Input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></Field><Field label="Site do fornecedor"><Input value={form.supplier_url} onChange={(event) => setForm({ ...form, supplier_url: event.target.value })} /></Field>
      <Field className="col-span-2" label="Link do produto"><Input value={form.purchase_link} onChange={(event) => setForm({ ...form, purchase_link: event.target.value })} /></Field>
      <Field label="Unidade"><Input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field><Field label="Custo unitário"><Input inputMode="decimal" value={form.unit_cost} onChange={(event) => setForm({ ...form, unit_cost: event.target.value })} /></Field>
      <Field label="Qtd. comprada"><Input inputMode="decimal" value={form.quantity_purchased} onChange={(event) => setForm({ ...form, quantity_purchased: event.target.value })} /></Field><Field label="Qtd. disponível"><Input inputMode="decimal" value={form.quantity_available} onChange={(event) => setForm({ ...form, quantity_available: event.target.value })} /></Field>
      <Field label="Estoque mínimo"><Input inputMode="decimal" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} /></Field><Field label="Local do estoque"><Input value={form.stock_location} onChange={(event) => setForm({ ...form, stock_location: event.target.value })} /></Field>
      <Field label="Data da compra"><Input type="date" value={form.purchase_date} onChange={(event) => setForm({ ...form, purchase_date: event.target.value })} /></Field><Field label="Validade"><Input type="date" value={form.expiration_date} onChange={(event) => setForm({ ...form, expiration_date: event.target.value })} /></Field>
      <Field label="Temperatura mínima"><Input type="number" value={form.temperature_min_c} onChange={(event) => setForm({ ...form, temperature_min_c: event.target.value })} /></Field><Field label="Temperatura máxima"><Input type="number" value={form.temperature_max_c} onChange={(event) => setForm({ ...form, temperature_max_c: event.target.value })} /></Field>
      <Field label="Cone recomendado"><Input value={form.recommended_cone} onChange={(event) => setForm({ ...form, recommended_cone: event.target.value })} /></Field><Field label="Cone máximo"><Input value={form.max_cone} onChange={(event) => setForm({ ...form, max_cone: event.target.value })} /></Field>
      <Field label="Uso"><Input value={form.use_case} onChange={(event) => setForm({ ...form, use_case: event.target.value })} /></Field><Field label="Cor"><Input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></Field>
      <Field label="Acabamento"><Input value={form.finish} onChange={(event) => setForm({ ...form, finish: event.target.value })} /></Field><Field label="Lote"><Input value={form.batch} onChange={(event) => setForm({ ...form, batch: event.target.value })} /></Field>
      <Field className="col-span-2" label="Compatibilidade"><Input value={form.compatibility} onChange={(event) => setForm({ ...form, compatibility: event.target.value })} /></Field><Field className="col-span-2" label="Observações"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      <div className="col-span-2 flex items-center gap-3"><Switch checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} /><Label>Ativo</Label></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button></DialogFooter></DialogContent></Dialog>
  </PageContainer>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "expense" }) { return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-xl ${tone === "expense" ? "text-expense" : ""}`}>{value}</div></CardContent></Card>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-mono">{value}</div></div>; }
function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) { return <div className={`space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>; }
