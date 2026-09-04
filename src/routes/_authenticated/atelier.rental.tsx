import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, parseLocaleAmount } from "@/lib/format";
import {
  RENTAL_ORDER_STATUS,
  RENTAL_PAYMENT_STATUS,
  RENTAL_SLOT_STATUS,
} from "@/lib/rental";
import { ExternalLink, Flame, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/rental")({ component: Page });

const sb = supabase as any;

const emptySlot = () => ({
  title: "",
  description: "",
  kiln_name: "",
  firing_type: "glaze",
  capacity_liters: "100",
  price_per_liter: "12",
  min_liters: "0",
  opens_at: "",
  closes_at: "",
  firing_date: "",
  pickup_date: "",
  status: "open",
  notes: "",
});

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySlot());

  const { data: settings } = useQuery({
    queryKey: ["rental-settings", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("rental_settings")
        .select("*")
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["rental-slots", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("rental_slots")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["rental-orders", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("rental_orders")
        .select(
          "*, rental_slots(title, firing_date), rental_customers(name, email, phone), rental_order_items(piece_name, quantity, volume_liters, total_price)",
        )
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const usageBySlot = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders as any[]) {
      if (!["pending", "confirmed", "completed"].includes(o.status)) continue;
      map[o.slot_id] = (map[o.slot_id] ?? 0) + Number(o.total_liters ?? 0);
    }
    return map;
  }, [orders]);

  const totals = useMemo(() => {
    const active = (orders as any[]).filter((o) => o.status !== "cancelled");
    return {
      count: active.length,
      liters: active.reduce((s, o) => s + Number(o.total_liters ?? 0), 0),
      revenue: active.reduce((s, o) => s + Number(o.total ?? 0), 0),
    };
  }, [orders]);

  const ensureSettings = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await sb
        .from("rental_settings")
        .upsert({ workspace_id: wsId, ...patch }, { onConflict: "workspace_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-settings", wsId] });
      toast.success("Configurações salvas.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveSlot = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe o título da vaga.");
      const capacity = parseLocaleAmount(form.capacity_liters);
      if (!Number.isFinite(capacity) || capacity <= 0) throw new Error("Capacidade inválida.");
      const payload = {
        workspace_id: wsId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        kiln_name: form.kiln_name.trim() || null,
        firing_type: form.firing_type,
        capacity_liters: capacity,
        price_per_liter: parseLocaleAmount(form.price_per_liter) || 0,
        min_liters: parseLocaleAmount(form.min_liters) || 0,
        opens_at: form.opens_at || null,
        closes_at: form.closes_at || null,
        firing_date: form.firing_date || null,
        pickup_date: form.pickup_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      const { error } = editId
        ? await sb.from("rental_slots").update(payload).eq("id", editId)
        : await sb.from("rental_slots").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-slots", wsId] });
      setOpen(false);
      setEditId(null);
      setForm(emptySlot());
      toast.success("Vaga salva.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("rental_slots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-slots", wsId] });
      qc.invalidateQueries({ queryKey: ["rental-orders", wsId] });
      toast.success("Vaga removida.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await sb.from("rental_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-orders", wsId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (row: any) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? "",
      description: row.description ?? "",
      kiln_name: row.kiln_name ?? "",
      firing_type: row.firing_type ?? "glaze",
      capacity_liters: String(row.capacity_liters ?? ""),
      price_per_liter: String(row.price_per_liter ?? ""),
      min_liters: String(row.min_liters ?? "0"),
      opens_at: row.opens_at ?? "",
      closes_at: row.closes_at ?? "",
      firing_date: row.firing_date ?? "",
      pickup_date: row.pickup_date ?? "",
      status: row.status ?? "open",
      notes: row.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Selá Rental"
        description="Vagas de queima, pedidos e configuração da plataforma pública."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/rental" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Ver página pública
              </a>
            </Button>
            <Button
              onClick={() => {
                setEditId(null);
                setForm(emptySlot());
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nova vaga
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pedidos ativos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Volume reservado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {totals.liters.toFixed(1)} L
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Receita prevista</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(totals.revenue, currency)}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="slots" className="mt-4">
        <TabsList>
          <TabsTrigger value="slots">Vagas</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="slots" className="space-y-3">
          {(slots as any[]).length === 0 ? (
            <EmptyState
              icon={Flame}
              title="Nenhuma vaga cadastrada"
              description="Crie uma vaga de queima para publicá-la na plataforma pública."
            />
          ) : (
            (slots as any[]).map((s) => {
              const used = usageBySlot[s.id] ?? 0;
              return (
                <Card key={s.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.title}</span>
                        <Badge variant={s.status === "open" ? "default" : "secondary"}>
                          {RENTAL_SLOT_STATUS[s.status] ?? s.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {used.toFixed(1)} L de {Number(s.capacity_liters).toFixed(1)} L ·{" "}
                        {formatCurrency(Number(s.price_per_liter), currency)}/L
                        {s.firing_date ? ` · queima ${s.firing_date}` : ""}
                        {s.closes_at ? ` · inscrições até ${s.closes_at}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Remover esta vaga e seus pedidos?")) removeSlot.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-3">
          {(orders as any[]).length === 0 ? (
            <EmptyState
              icon={Flame}
              title="Nenhum pedido ainda"
              description="Os pedidos feitos em /rental aparecem aqui."
            />
          ) : (
            (orders as any[]).map((o) => (
              <Card key={o.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm">{o.code}</span>{" "}
                      <span className="font-medium">{o.rental_customers?.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {o.rental_customers?.email}
                        {o.rental_customers?.phone ? ` · ${o.rental_customers.phone}` : ""} ·{" "}
                        {o.rental_slots?.title}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(Number(o.total), currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Number(o.total_liters).toFixed(2)} L
                      </p>
                    </div>
                  </div>
                  <ul className="text-xs text-muted-foreground">
                    {(o.rental_order_items ?? []).map((i: any, idx: number) => (
                      <li key={idx}>
                        {i.piece_name} × {i.quantity} · {Number(i.volume_liters).toFixed(2)} L
                      </li>
                    ))}
                  </ul>
                  {o.notes && <p className="text-xs italic text-muted-foreground">{o.notes}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={o.status}
                      onValueChange={(v) => updateOrder.mutate({ id: o.id, patch: { status: v } })}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RENTAL_ORDER_STATUS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={o.payment_status}
                      onValueChange={(v) =>
                        updateOrder.mutate({ id: o.id, patch: { payment_status: v } })
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(RENTAL_PAYMENT_STATUS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="settings">
          <SettingsForm
            settings={settings}
            saving={ensureSettings.isPending}
            onSave={(patch) => ensureSettings.mutate(patch)}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar vaga" : "Nova vaga de queima"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Forno</Label>
              <Input
                value={form.kiln_name}
                onChange={(e) => setForm({ ...form, kiln_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo de queima</Label>
              <Select
                value={form.firing_type}
                onValueChange={(v) => setForm({ ...form, firing_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="biscuit">Biscoito</SelectItem>
                  <SelectItem value="glaze">Esmalte</SelectItem>
                  <SelectItem value="other">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacidade (L)</Label>
              <Input
                value={form.capacity_liters}
                onChange={(e) => setForm({ ...form, capacity_liters: e.target.value })}
              />
            </div>
            <div>
              <Label>Preço por litro</Label>
              <Input
                value={form.price_per_liter}
                onChange={(e) => setForm({ ...form, price_per_liter: e.target.value })}
              />
            </div>
            <div>
              <Label>Volume mínimo (L)</Label>
              <Input
                value={form.min_liters}
                onChange={(e) => setForm({ ...form, min_liters: e.target.value })}
              />
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RENTAL_SLOT_STATUS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Inscrições abrem</Label>
              <Input
                type="date"
                value={form.opens_at}
                onChange={(e) => setForm({ ...form, opens_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Inscrições fecham</Label>
              <Input
                type="date"
                value={form.closes_at}
                onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Data da queima</Label>
              <Input
                type="date"
                value={form.firing_date}
                onChange={(e) => setForm({ ...form, firing_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Retirada</Label>
              <Input
                type="date"
                value={form.pickup_date}
                onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas internas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveSlot.mutate()} disabled={saveSlot.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function SettingsForm({
  settings,
  saving,
  onSave,
}: {
  settings: any;
  saving: boolean;
  onSave: (patch: Record<string, any>) => void;
}) {
  const [state, setState] = useState({
    public_name: settings?.public_name ?? "Selá Rental",
    headline: settings?.headline ?? "Alugue espaço no nosso forno",
    description: settings?.description ?? "",
    terms: settings?.terms ?? "",
    contact_email: settings?.contact_email ?? "",
    contact_phone: settings?.contact_phone ?? "",
    is_published: settings?.is_published ?? true,
  });

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <Label>Nome público</Label>
          <Input
            value={state.public_name}
            onChange={(e) => setState({ ...state, public_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Chamada principal</Label>
          <Input
            value={state.headline}
            onChange={(e) => setState({ ...state, headline: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Descrição</Label>
          <Textarea
            rows={2}
            value={state.description}
            onChange={(e) => setState({ ...state, description: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Termos / regras</Label>
          <Textarea
            rows={2}
            value={state.terms}
            onChange={(e) => setState({ ...state, terms: e.target.value })}
          />
        </div>
        <div>
          <Label>E-mail de contato</Label>
          <Input
            value={state.contact_email}
            onChange={(e) => setState({ ...state, contact_email: e.target.value })}
          />
        </div>
        <div>
          <Label>Telefone de contato</Label>
          <Input
            value={state.contact_phone}
            onChange={(e) => setState({ ...state, contact_phone: e.target.value })}
          />
        </div>
        <div>
          <Label>Plataforma pública</Label>
          <Select
            value={state.is_published ? "yes" : "no"}
            onValueChange={(v) => setState({ ...state, is_published: v === "yes" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Publicada</SelectItem>
              <SelectItem value="no">Fora do ar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Button onClick={() => onSave(state)} disabled={saving}>
            Salvar configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
