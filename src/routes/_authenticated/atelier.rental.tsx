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
import { KilnFiring3DPlanner } from "@/components/rental/kiln-firing-3d";
import { formatCurrency, parseLocaleAmount } from "@/lib/format";
import {
  buildRentalOrderStatusMessage,
  normalizeRentalWhatsAppPhone,
  RENTAL_FIRING_PRICE_PER_LITER,
  RENTAL_FIRING_TYPE,
  RENTAL_ORDER_STATUS,
  RENTAL_PAYMENT_STATUS,
  RENTAL_SLOT_STATUS,
} from "@/lib/rental";
import {
  ExternalLink,
  FileText,
  Flame,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { OrderCostDialog } from "@/components/rental/order-cost-dialog";
import { formatDimension } from "@/lib/rental-cost-statement";

export const Route = createFileRoute("/_authenticated/atelier/rental")({ component: Page });

const sb = supabase as any;

type KilnSupportInventoryItem = {
  height_cm: number;
  quantity: number;
};

const DEFAULT_KILN_SUPPORT_INVENTORY: KilnSupportInventoryItem[] = [
  { height_cm: 15, quantity: 8 },
  { height_cm: 12.5, quantity: 8 },
  { height_cm: 10, quantity: 8 },
  { height_cm: 7.5, quantity: 8 },
  { height_cm: 5, quantity: 8 },
  { height_cm: 2.5, quantity: 8 },
];

function normalizeKilnSupportInventory(value: unknown): KilnSupportInventoryItem[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_KILN_SUPPORT_INVENTORY;
  const normalized = value
    .map((item) => ({
      height_cm: Number((item as KilnSupportInventoryItem)?.height_cm),
      quantity: Number((item as KilnSupportInventoryItem)?.quantity),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.height_cm) &&
        item.height_cm > 0 &&
        Number.isInteger(item.quantity) &&
        item.quantity >= 0,
    )
    .sort((a, b) => b.height_cm - a.height_cm);
  return normalized.length > 0 ? normalized : DEFAULT_KILN_SUPPORT_INVENTORY;
}

function formatFullDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatOrderCreatedAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function orderMonthLabel(value: string) {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const emptySlot = () => ({
  title: "",
  description: "",
  kiln_name: "",
  firing_type: "glaze",
  capacity_liters: "999999999",
  price_per_liter: "7",
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
  const [orderEmailFilter, setOrderEmailFilter] = useState("");
  const [orderSlotFilter, setOrderSlotFilter] = useState("__all__");
  const [orderMonthFilter, setOrderMonthFilter] = useState("__all__");
  const [statusNotification, setStatusNotification] = useState<{
    order: any;
    status: string;
  } | null>(null);

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

  const { data: pricingHistory = [] } = useQuery({
    queryKey: ["rental-pricing-history", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("rental_pricing_history")
        .select("*")
        .eq("workspace_id", wsId)
        .order("changed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: capacityHistory = [] } = useQuery({
    queryKey: ["rental-capacity-settings-history", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("rental_capacity_settings_history")
        .select("*")
        .eq("workspace_id", wsId)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const configuredPricePerLiter = (firingType: string) => {
    if (firingType === "biscuit") {
      return Number(settings?.biscuit_coefficient ?? 0.0045) * 1000;
    }
    if (firingType === "glaze") {
      return Number(settings?.glaze_coefficient ?? 0.007) * 1000;
    }
    return null;
  };

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

  const [costOrder, setCostOrder] = useState<any>(null);
  const { data: orders = [] } = useQuery({
    queryKey: ["rental-orders", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("rental_orders")
        .select(
          "*, rental_slots(title, kiln_name, firing_type, firing_date, pickup_date, closes_at), rental_customers(name, studio_name, email, phone, document), rental_order_items(piece_name, quantity, height_cm, width_cm, depth_cm, volume_liters, unit_price, total_price), rental_payments(id, type, amount, status, method, paid_at)",
        )
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderMonths = useMemo(
    () =>
      Array.from(
        new Set(
          (orders as any[])
            .map((order) => String(order.created_at || "").slice(0, 7))
            .filter((value) => /^\d{4}-\d{2}$/.test(value)),
        ),
      ).sort((a, b) => b.localeCompare(a)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const email = orderEmailFilter.trim().toLowerCase();
    return (orders as any[]).filter((order) => {
      if (orderSlotFilter !== "__all__" && order.slot_id !== orderSlotFilter) return false;
      if (orderMonthFilter !== "__all__") {
        const createdMonth = String(order.created_at || "").slice(0, 7);
        if (createdMonth !== orderMonthFilter) return false;
      }
      if (
        email &&
        !String(order.rental_customers?.email || "")
          .toLowerCase()
          .includes(email)
      ) {
        return false;
      }
      return true;
    });
  }, [orders, orderEmailFilter, orderMonthFilter, orderSlotFilter]);

  const usageBySlot = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders as any[]) {
      if (o.status === "cancelled") continue;
      map[o.slot_id] = (map[o.slot_id] ?? 0) + Number(o.total_liters ?? 0);
    }
    return map;
  }, [orders]);
  const totals = useMemo(() => {
    const active = (orders as any[]).filter((o) => o.status !== "cancelled");
    const quantityFor = (order: any) =>
      (order.rental_order_items ?? []).reduce(
        (sum: number, item: any) => sum + Number(item.quantity ?? 0),
        0,
      );
    const today = new Date().toISOString().slice(0, 10);
    return {
      upcomingFirings: (slots as any[]).filter(
        (slot) =>
          slot.status === "open" && (!slot.firing_date || String(slot.firing_date) >= today),
      ).length,
      awaitingPieces: active
        .filter((o) => ["received", "awaiting_firing"].includes(o.status))
        .reduce((sum, order) => sum + quantityFor(order), 0),
      readyPieces: active
        .filter((o) => o.status === "ready_for_pickup")
        .reduce((sum, order) => sum + quantityFor(order), 0),
      receivable: active.reduce(
        (sum, order) =>
          sum +
          (order.rental_payments ?? [])
            .filter((payment: any) => !["paid", "cancelled", "refunded"].includes(payment.status))
            .reduce((paymentSum: number, payment: any) => paymentSum + Number(payment.amount), 0),
        0,
      ),
    };
  }, [orders, slots]);

  const ensureSettings = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      if (Number(patch.biscuit_coefficient) <= 0 || Number(patch.glaze_coefficient) <= 0) {
        throw new Error("Os coeficientes de Biscoito e Esmalte devem ser maiores que zero.");
      }
      if (Number(patch.glaze_spacing_cm) < 0 || Number(patch.glaze_spacing_cm) > 20) {
        throw new Error("A margem entre peças no esmalte deve ficar entre 0 e 20 cm.");
      }
      if (Number(patch.kiln_shelf_diameter_cm) <= 0 || Number(patch.kiln_internal_height_cm) <= 0) {
        throw new Error("As dimensões físicas do forno devem ser maiores que zero.");
      }
      if (
        Number(patch.kiln_wall_clearance_cm) < 0 ||
        Number(patch.kiln_wall_clearance_cm) * 2 >= Number(patch.kiln_shelf_diameter_cm)
      ) {
        throw new Error("O afastamento da parede deve ser menor que metade do diâmetro útil.");
      }
      if (
        !Number.isInteger(Number(patch.kiln_supports_per_level)) ||
        Number(patch.kiln_supports_per_level) < 1 ||
        Number(patch.kiln_supports_per_level) > 20
      ) {
        throw new Error(
          "A quantidade de suportes por novo andar deve ser um inteiro entre 1 e 20.",
        );
      }
      if (
        Number(patch.kiln_shelf_thickness_cm) <= 0 ||
        Number(patch.kiln_shelf_thickness_cm) > 10 ||
        Number(patch.kiln_shelf_thickness_cm) >= Number(patch.kiln_internal_height_cm)
      ) {
        throw new Error(
          "A espessura da prateleira deve ficar entre 0,1 e 10 cm e ser menor que a altura do forno.",
        );
      }
      if (
        Number(patch.biscuit_vertical_max_height_cm) <= 0 ||
        Number(patch.biscuit_vertical_max_height_cm) > 30
      ) {
        throw new Error("A altura máxima para acomodação vertical deve ficar entre 0,1 e 30 cm.");
      }
      if (
        Number(patch.biscuit_vertical_max_ratio) <= 0 ||
        Number(patch.biscuit_vertical_max_ratio) > 1
      ) {
        throw new Error("A proporção máxima de peça baixa deve ficar entre 1% e 100%.");
      }
      if (
        !Number.isInteger(Number(patch.biscuit_stack_max_pieces)) ||
        Number(patch.biscuit_stack_max_pieces) < 1 ||
        Number(patch.biscuit_stack_max_pieces) > 10
      ) {
        throw new Error("O máximo por pilha de biscoito deve ser um inteiro entre 1 e 10.");
      }
      if (
        Number(patch.biscuit_stack_height_factor) < 0.1 ||
        Number(patch.biscuit_stack_height_factor) > 1
      ) {
        throw new Error("O incremento de altura da pilha deve ficar entre 10% e 100%.");
      }
      if (!String(patch.biscuit_stackable_keywords || "").trim()) {
        throw new Error("Informe pelo menos um nome de peça que pode ser empilhada.");
      }
      const supportInventory = normalizeKilnSupportInventory(patch.kiln_support_inventory);
      if (
        supportInventory.some(
          (item) =>
            item.height_cm > Number(patch.kiln_internal_height_cm) ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 0,
        )
      ) {
        throw new Error("Revise as alturas e quantidades do estoque de suportes.");
      }
      const { error } = await sb
        .from("rental_settings")
        .upsert(
          { workspace_id: wsId, ...patch, kiln_support_inventory: supportInventory },
          { onConflict: "workspace_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-settings", wsId] });
      qc.invalidateQueries({ queryKey: ["rental-slots", wsId] });
      qc.invalidateQueries({ queryKey: ["rental-pricing-history", wsId] });
      qc.invalidateQueries({ queryKey: ["rental-capacity-settings-history", wsId] });
      toast.success("Configurações salvas.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveSlot = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe o título da vaga.");
      const { error: settingsError } = await sb.from("rental_settings").upsert(
        {
          workspace_id: wsId,
          public_name: "Selá Queimas",
          is_published: true,
        },
        { onConflict: "workspace_id", ignoreDuplicates: true },
      );
      if (settingsError) throw settingsError;
      const { data: currentPricing, error: pricingError } = await sb
        .from("rental_settings")
        .select("biscuit_coefficient, glaze_coefficient")
        .eq("workspace_id", wsId)
        .single();
      if (pricingError) throw pricingError;
      const currentConfiguredPrice =
        form.firing_type === "biscuit"
          ? Number(currentPricing.biscuit_coefficient) * 1000
          : form.firing_type === "glaze"
            ? Number(currentPricing.glaze_coefficient) * 1000
            : null;
      const payload = {
        workspace_id: wsId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        kiln_name: form.kiln_name.trim() || null,
        firing_type: form.firing_type,
        capacity_liters: 999999999,
        price_per_liter: currentConfiguredPrice ?? (parseLocaleAmount(form.price_per_liter) || 0),
        min_liters: 0,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-orders", wsId] });
      toast.success("Pedido atualizado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changeOrderStatus = (order: any, status: string) => {
    if (status === order.status) return;
    updateOrder.mutate(
      { id: order.id, patch: { status } },
      { onSuccess: () => setStatusNotification({ order, status }) },
    );
  };

  const statusMessage = statusNotification
    ? buildRentalOrderStatusMessage({
        customerName: statusNotification.order.rental_customers?.name || "cliente",
        orderCode: statusNotification.order.code,
        status: statusNotification.status,
        slotTitle: statusNotification.order.rental_slots?.title || "Vaga de queima",
        firingType: statusNotification.order.rental_slots?.firing_type,
        firingDate: statusNotification.order.rental_slots?.firing_date,
        pickupDate:
          statusNotification.order.estimated_pickup_date ||
          statusNotification.order.rental_slots?.pickup_date,
        trackingUrl: `${typeof window === "undefined" ? "https://selafinance.lovable.app" : window.location.origin}/rental`,
      })
    : "";

  const openStatusEmail = () => {
    if (!statusNotification) return;
    const recipient = String(statusNotification.order.rental_customers?.email || "").trim();
    if (!recipient) {
      toast.error("Este cliente não possui e-mail cadastrado.");
      return;
    }
    const subject = `Atualização do pedido ${statusNotification.order.code} — Selá Queimas`;
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(statusMessage)}`;
    setStatusNotification(null);
  };

  const openStatusWhatsApp = () => {
    if (!statusNotification) return;
    const phone = normalizeRentalWhatsAppPhone(statusNotification.order.rental_customers?.phone);
    const destination = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(statusMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(statusMessage)}`;
    window.open(destination, "_blank", "noopener,noreferrer");
    if (!phone) toast.info("Telefone não cadastrado; escolha o contato no WhatsApp.");
    setStatusNotification(null);
  };

  const registerPayment = useMutation({
    mutationFn: async ({ order, payment }: { order: any; payment: any }) => {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await sb
        .from("rental_payments")
        .update({ status: "paid", method: "pix", paid_at: today })
        .eq("id", payment.id)
        .eq("workspace_id", wsId);
      if (error) throw error;
      const allPaid = (order.rental_payments ?? []).every(
        (row: any) => row.id === payment.id || row.status === "paid",
      );
      const patch: Record<string, any> = {
        payment_status: allPaid ? "paid" : "partial",
      };
      if (payment.type === "deposit" && order.status === "awaiting_payment") {
        patch.status = "confirmed";
      }
      const { error: orderError } = await sb
        .from("rental_orders")
        .update(patch)
        .eq("id", order.id)
        .eq("workspace_id", wsId);
      if (orderError) throw orderError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-orders", wsId] });
      toast.success("Pagamento registrado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (row: any) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? "",
      description: row.description ?? "",
      kiln_name: row.kiln_name ?? "",
      firing_type: row.firing_type ?? "glaze",
      capacity_liters: "999999999",
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
        title="Selá Queimas"
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Próximas queimas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.upcomingFirings}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Peças aguardando queima</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.awaitingPieces}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Prontas para retirada</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.readyPieces}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valores a receber</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(totals.receivable, currency)}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="slots" className="mt-4">
        <TabsList>
          <TabsTrigger value="slots">Vagas</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="kiln-3d">Fornada 3D</TabsTrigger>
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
            (slots as any[]).map((s) => (
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
                      {s.firing_date ? `Queima em ${s.firing_date}` : "Data da queima a definir"}
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
            ))
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(180px,0.7fr)_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="rental-order-email-filter">E-mail do cliente</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="rental-order-email-filter"
                      value={orderEmailFilter}
                      onChange={(event) => setOrderEmailFilter(event.target.value)}
                      className="pl-9"
                      placeholder="Buscar por e-mail..."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Vaga de queima</Label>
                  <Select value={orderSlotFilter} onValueChange={setOrderSlotFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas as vagas</SelectItem>
                      {(slots as any[]).map((slot) => (
                        <SelectItem key={slot.id} value={slot.id}>
                          {slot.title}
                          {slot.firing_date ? ` · ${formatFullDate(slot.firing_date)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Mês do pedido</Label>
                  <Select value={orderMonthFilter} onValueChange={setOrderMonthFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos os meses</SelectItem>
                      {orderMonths.map((value) => (
                        <SelectItem key={value} value={value}>
                          {orderMonthLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full md:w-auto"
                    disabled={
                      !orderEmailFilter &&
                      orderSlotFilter === "__all__" &&
                      orderMonthFilter === "__all__"
                    }
                    onClick={() => {
                      setOrderEmailFilter("");
                      setOrderSlotFilter("__all__");
                      setOrderMonthFilter("__all__");
                    }}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {filteredOrders.length} de {(orders as any[]).length} pedido(s) exibido(s)
              </p>
            </CardContent>
          </Card>

          {(orders as any[]).length === 0 ? (
            <EmptyState
              icon={Flame}
              title="Nenhum pedido ainda"
              description="Os pedidos feitos em /rental aparecem aqui."
            />
          ) : filteredOrders.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nenhum pedido encontrado"
              description="Ajuste ou limpe os filtros para ver outros pedidos."
            />
          ) : (
            filteredOrders.map((o) => (
              <Card key={o.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm">{o.code}</span>{" "}
                      <span className="font-medium">{o.rental_customers?.name}</span>
                      <p className="text-xs text-muted-foreground">
                        {o.rental_customers?.studio_name
                          ? `${o.rental_customers.studio_name} · `
                          : ""}
                        {o.rental_customers?.email}
                        {o.rental_customers?.phone ? ` · ${o.rental_customers.phone}` : ""} ·{" "}
                        {o.rental_slots?.title}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(Number(o.total), currency)}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Pedido realizado</p>
                      <p className="font-medium">{formatOrderCreatedAt(o.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vaga selecionada</p>
                      <p className="font-medium">{o.rental_slots?.title ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tipo de queima</p>
                      <p className="font-medium">
                        {RENTAL_FIRING_TYPE[o.rental_slots?.firing_type] ??
                          o.rental_slots?.firing_type ??
                          "—"}
                        {o.rental_slots?.kiln_name ? ` · ${o.rental_slots.kiln_name}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Datas previstas</p>
                      <p className="font-medium">
                        Queima: {formatFullDate(o.rental_slots?.firing_date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Retirada:{" "}
                        {formatFullDate(o.estimated_pickup_date || o.rental_slots?.pickup_date)}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {(o.rental_order_items ?? []).map((i: any, idx: number) => (
                      <li key={idx} className="rounded-md border px-2 py-1.5">
                        <span className="font-medium">
                          {i.piece_name} × {i.quantity}
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-muted-foreground">
                          <span>Comprimento: {formatDimension(i.width_cm)}</span>
                          <span>Profundidade: {formatDimension(i.depth_cm)}</span>
                          <span>Altura: {formatDimension(i.height_cm)}</span>
                          {i.volume_liters != null && (
                            <span>Volume: {Number(i.volume_liters).toLocaleString("pt-BR")} L</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" onClick={() => setCostOrder(o)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Ver detalhes dos custos
                  </Button>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(o.rental_payments ?? []).map((payment: any) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between rounded-md border p-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {payment.type === "deposit" ? "Entrada" : "Saldo"} ·{" "}
                            {formatCurrency(Number(payment.amount), currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {RENTAL_PAYMENT_STATUS[payment.status] ?? payment.status}
                          </p>
                        </div>
                        {payment.status !== "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={registerPayment.isPending}
                            onClick={() => registerPayment.mutate({ order: o, payment })}
                          >
                            Registrar PIX
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {o.notes && <p className="text-xs italic text-muted-foreground">{o.notes}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Select
                      value={o.status}
                      disabled={updateOrder.isPending}
                      onValueChange={(value) => changeOrderStatus(o, value)}
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
          {costOrder && (
            <OrderCostDialog
              order={costOrder}
              open={!!costOrder}
              onOpenChange={(v) => !v && setCostOrder(null)}
            />
          )}
        </TabsContent>

        <TabsContent value="kiln-3d" className="space-y-3">
          <KilnFiring3DPlanner
            slots={slots as any[]}
            orders={orders as any[]}
            settings={settings}
          />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsForm
            key={settings?.updated_at ?? "new"}
            settings={settings}
            pricingHistory={pricingHistory}
            capacityHistory={capacityHistory}
            saving={ensureSettings.isPending}
            onSave={(patch) => ensureSettings.mutate(patch)}
          />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!statusNotification}
        onOpenChange={(isOpen) => {
          if (!isOpen) setStatusNotification(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Avisar cliente sobre o novo status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              O status já foi atualizado para{" "}
              <strong className="text-foreground">
                {statusNotification
                  ? (RENTAL_ORDER_STATUS[statusNotification.status] ?? statusNotification.status)
                  : ""}
              </strong>
              . Escolha como avisar o cliente ou feche esta janela para não enviar nada.
            </p>
            <Textarea value={statusMessage} readOnly rows={11} className="resize-none text-sm" />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStatusNotification(null)}>
              Agora não
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={openStatusEmail}
                disabled={!statusNotification?.order.rental_customers?.email}
              >
                <Mail className="mr-2 h-4 w-4" /> Abrir e-mail
              </Button>
              <Button type="button" onClick={openStatusWhatsApp}>
                <MessageCircle className="mr-2 h-4 w-4" /> Abrir WhatsApp
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    firing_type: v,
                    price_per_liter: String(
                      configuredPricePerLiter(v) ?? RENTAL_FIRING_PRICE_PER_LITER[v] ?? 7,
                    ),
                  })
                }
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
  pricingHistory,
  capacityHistory,
  saving,
  onSave,
}: {
  settings: any;
  pricingHistory: any[];
  capacityHistory: any[];
  saving: boolean;
  onSave: (patch: Record<string, any>) => void;
}) {
  const [state, setState] = useState({
    public_name: settings?.public_name ?? "Selá Queimas",
    headline: settings?.headline ?? "Agende sua queima",
    description: settings?.description ?? "",
    terms: settings?.terms ?? "",
    contact_email: settings?.contact_email ?? "",
    contact_phone: settings?.contact_phone ?? "",
    deposit_percentage: settings?.deposit_percentage ?? 50,
    pix_key: settings?.pix_key ?? "60.607.671/0001-47",
    address: settings?.address ?? "",
    customer_instructions: settings?.customer_instructions ?? "",
    biscuit_coefficient: settings?.biscuit_coefficient ?? 0.0045,
    glaze_coefficient: settings?.glaze_coefficient ?? 0.007,
    glaze_spacing_cm: settings?.glaze_spacing_cm ?? 1,
    kiln_shelf_diameter_cm: settings?.kiln_shelf_diameter_cm ?? 52.5,
    kiln_internal_height_cm: settings?.kiln_internal_height_cm ?? 45,
    kiln_wall_clearance_cm: settings?.kiln_wall_clearance_cm ?? 1,
    kiln_shelf_thickness_cm: settings?.kiln_shelf_thickness_cm ?? 1.5,
    kiln_supports_per_level: settings?.kiln_supports_per_level ?? 4,
    kiln_support_inventory: normalizeKilnSupportInventory(settings?.kiln_support_inventory),
    biscuit_vertical_max_height_cm: settings?.biscuit_vertical_max_height_cm ?? 4,
    biscuit_vertical_max_ratio: settings?.biscuit_vertical_max_ratio ?? 0.25,
    biscuit_stack_max_pieces: settings?.biscuit_stack_max_pieces ?? 3,
    biscuit_stack_height_factor: settings?.biscuit_stack_height_factor ?? 0.65,
    biscuit_stackable_keywords:
      settings?.biscuit_stackable_keywords ?? "bowl,tigela,cumbuca,caneca,xícara,xicara,copo",
    is_published: settings?.is_published ?? true,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Precificação das queimas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Coeficiente Biscoito</Label>
            <Input
              type="number"
              min="0.000001"
              step="0.0001"
              value={state.biscuit_coefficient}
              onChange={(e) => setState({ ...state, biscuit_coefficient: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado no cálculo automático conforme as dimensões informadas pelo cliente.
            </p>
          </div>
          <div>
            <Label>Coeficiente Esmalte</Label>
            <Input
              type="number"
              min="0.000001"
              step="0.0001"
              value={state.glaze_coefficient}
              onChange={(e) => setState({ ...state, glaze_coefficient: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado no cálculo automático conforme as dimensões informadas pelo cliente.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>Margem entre peças no esmalte (cm)</Label>
            <Input
              type="number"
              min="0"
              max="20"
              step="0.1"
              value={state.glaze_spacing_cm}
              onChange={(e) => setState({ ...state, glaze_spacing_cm: Number(e.target.value) })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Aplicada somente à queima de esmalte. É acrescentada à largura e à profundidade de
              cada peça; a altura não é alterada. O padrão é 1 cm.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capacidade física e mobília do forno</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <Label>Diâmetro útil da prateleira (cm)</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={state.kiln_shelf_diameter_cm}
                onChange={(e) =>
                  setState({ ...state, kiln_shelf_diameter_cm: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Altura interna do forno (cm)</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={state.kiln_internal_height_cm}
                onChange={(e) =>
                  setState({ ...state, kiln_internal_height_cm: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Afastamento da parede (cm)</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={state.kiln_wall_clearance_cm}
                onChange={(e) =>
                  setState({ ...state, kiln_wall_clearance_cm: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Suportes por novo andar</Label>
              <Input
                type="number"
                min="1"
                max="20"
                step="1"
                value={state.kiln_supports_per_level}
                onChange={(e) =>
                  setState({
                    ...state,
                    kiln_supports_per_level: Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                O padrão do forno atual é 4 suportes da mesma altura.
              </p>
            </div>
            <div>
              <Label>Espessura da prateleira (cm)</Label>
              <Input
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={state.kiln_shelf_thickness_cm}
                onChange={(e) =>
                  setState({
                    ...state,
                    kiln_shelf_thickness_cm: Number(e.target.value),
                  })
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Descontada da altura disponível em cada novo nível.
              </p>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <Label>Estoque de suportes</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Informe quantas unidades físicas existem de cada altura. Cada novo andar acima da
                  base usa {state.kiln_supports_per_level} suportes da mesma altura. Por isso, uma
                  montagem com 3 andares usa 2 conjuntos, ou seja,{" "}
                  {state.kiln_supports_per_level * 2} suportes. Ao combinar alturas, um conjunto de
                  cada tamanho usado é consumido.
                </p>
              </div>
              <Badge variant="secondary">
                {state.kiln_support_inventory.reduce(
                  (sum, item) => sum + Number(item.quantity || 0),
                  0,
                )}{" "}
                suportes ·{" "}
                {state.kiln_support_inventory.reduce(
                  (sum, item) =>
                    sum +
                    Math.floor(
                      Number(item.quantity || 0) / Number(state.kiln_supports_per_level || 1),
                    ),
                  0,
                )}{" "}
                conjuntos completos
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {state.kiln_support_inventory.map((item, index) => (
                <div
                  key={item.height_cm}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
                >
                  <div>
                    <p className="font-medium">{item.height_cm.toLocaleString("pt-BR")} cm</p>
                    <p className="text-xs text-muted-foreground">
                      {Math.floor(
                        Number(item.quantity || 0) / Number(state.kiln_supports_per_level || 1),
                      )}{" "}
                      conjuntos completos disponíveis
                    </p>
                  </div>
                  <Input
                    className="w-24"
                    type="number"
                    min="0"
                    max="1000"
                    step="1"
                    value={item.quantity}
                    aria-label={`Quantidade de suportes de ${item.height_cm} cm`}
                    onChange={(e) => {
                      const next = [...state.kiln_support_inventory];
                      next[index] = {
                        ...item,
                        quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                      };
                      setState({ ...state, kiln_support_inventory: next });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-4">
              <Label className="text-base">Acomodação da queima de biscoito</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Peças baixas, como pratos, são planejadas na vertical. Peças com nomes reconhecidos,
                como bowls e canecas, podem formar pilhas. As demais permanecem individuais para
                evitar uma estimativa otimista.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label>Altura máxima para ficar na vertical (cm)</Label>
                <Input
                  type="number"
                  min="0.1"
                  max="30"
                  step="0.1"
                  value={state.biscuit_vertical_max_height_cm}
                  onChange={(e) =>
                    setState({
                      ...state,
                      biscuit_vertical_max_height_cm: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Proporção máxima de peça baixa (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={Math.round(state.biscuit_vertical_max_ratio * 100)}
                  onChange={(e) =>
                    setState({
                      ...state,
                      biscuit_vertical_max_ratio: Number(e.target.value) / 100,
                    })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  A altura deve representar no máximo esta proporção do menor lado.
                </p>
              </div>
              <div>
                <Label>Máximo de peças por pilha</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  value={state.biscuit_stack_max_pieces}
                  onChange={(e) =>
                    setState({
                      ...state,
                      biscuit_stack_max_pieces: Math.max(
                        1,
                        Math.trunc(Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </div>
              <div>
                <Label>Altura adicional por peça empilhada (%)</Label>
                <Input
                  type="number"
                  min="10"
                  max="100"
                  step="1"
                  value={Math.round(state.biscuit_stack_height_factor * 100)}
                  onChange={(e) =>
                    setState({
                      ...state,
                      biscuit_stack_height_factor: Number(e.target.value) / 100,
                    })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Padrão conservador: cada peça extra acrescenta 65% da própria altura.
                </p>
              </div>
              <div className="sm:col-span-2 xl:col-span-4">
                <Label>Nomes reconhecidos como empilháveis</Label>
                <Input
                  value={state.biscuit_stackable_keywords}
                  onChange={(e) =>
                    setState({ ...state, biscuit_stackable_keywords: e.target.value })
                  }
                  placeholder="bowl, tigela, caneca..."
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Separe por vírgulas. O sistema procura esses termos no nome informado para a peça;
                  nomes não reconhecidos continuam individuais.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações públicas e pagamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
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
            <Label>Entrada para reserva (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={state.deposit_percentage}
              onChange={(e) => setState({ ...state, deposit_percentage: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Chave PIX</Label>
            <Input
              value={state.pix_key}
              onChange={(e) => setState({ ...state, pix_key: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Endereço para entrega e retirada</Label>
            <Textarea
              rows={2}
              value={state.address}
              onChange={(e) => setState({ ...state, address: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Instruções ao cliente</Label>
            <Textarea
              rows={2}
              value={state.customer_instructions}
              onChange={(e) => setState({ ...state, customer_instructions: e.target.value })}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de precificação</CardTitle>
        </CardHeader>
        <CardContent>
          {pricingHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {pricingHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {entry.firing_type === "biscuit"
                        ? "Coeficiente Biscoito"
                        : entry.firing_type === "glaze"
                          ? "Coeficiente Esmalte"
                          : "Margem entre peças no esmalte"}
                      :{" "}
                      {Number(entry.old_coefficient).toLocaleString("pt-BR", {
                        minimumFractionDigits: entry.firing_type === "glaze_spacing" ? 1 : 4,
                      })}{" "}
                      →{" "}
                      {Number(entry.new_coefficient).toLocaleString("pt-BR", {
                        minimumFractionDigits: entry.firing_type === "glaze_spacing" ? 1 : 4,
                      })}
                      {entry.firing_type === "glaze_spacing" ? " cm" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.changed_by_email || "Sistema"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.changed_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de capacidade e mobília</CardTitle>
        </CardHeader>
        <CardContent>
          {capacityHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {capacityHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {entry.setting_key === "support_inventory"
                        ? "Mobília e regra de montagem alteradas"
                        : entry.setting_key === "biscuit_loading_rules"
                          ? "Regras de acomodação do biscoito alteradas"
                          : "Dimensões físicas do forno alteradas"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.changed_by_email || "Sistema"}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.changed_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
