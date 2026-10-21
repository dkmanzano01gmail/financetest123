import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/format";
import { createPixPayload } from "@/lib/pix-br";
import {
  RENTAL_ERRORS,
  RENTAL_ORDER_STATUS,
  RENTAL_PAYMENT_STATUS,
  RENTAL_WORKSPACE_ID,
  itemsPrice,
  normalizeItems,
  type RentalItemInput,
} from "@/lib/rental";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  Flame,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rental")({
  head: () => ({
    meta: [
      { title: "Selá Queimas — Agende sua queima" },
      {
        name: "description",
        content:
          "Reserve sua queima no ateliê Selá Cerâmica: escolha a data, informe suas peças e receba o orçamento online.",
      },
      { property: "og:title", content: "Selá Queimas — Agende sua queima" },
      {
        property: "og:description",
        content: "Reserve sua queima no ateliê Selá Cerâmica com orçamento e pagamento online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RentalPublicPage,
});

const sb = supabase as any;

const emptyItem = (): RentalItemInput => ({
  piece_name: "",
  height_cm: "",
  width_cm: "",
  depth_cm: "",
  quantity: "1",
});

function parseLocalDate(value?: string | null) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value?: string | null) {
  const date = parseLocalDate(value);
  return date
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "A definir";
}

function displayDateTime(value?: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
}

const trackingStages = ["Reserva", "Entrega das peças", "No ateliê", "Queima", "Retirada"] as const;

function trackingStageIndex(status?: string) {
  if (["pending", "awaiting_payment", "confirmed"].includes(status ?? "")) return 0;
  if (status === "awaiting_delivery") return 1;
  if (["received", "awaiting_firing"].includes(status ?? "")) return 2;
  if (["firing", "cooling"].includes(status ?? "")) return 3;
  if (["ready_for_pickup", "completed"].includes(status ?? "")) return 4;
  return 0;
}

function nextStepFor(status?: string, pendingAmount = 0) {
  if (status === "cancelled")
    return "Esta reserva foi cancelada. Entre em contato conosco se precisar de ajuda.";
  if (["pending", "awaiting_payment"].includes(status ?? "")) {
    return "Realize o pagamento da entrada para confirmarmos sua reserva.";
  }
  if (status === "confirmed")
    return "Aguarde nossas orientações para entregar suas peças no ateliê.";
  if (status === "awaiting_delivery")
    return "Entregue suas peças no Selá dentro do prazo combinado.";
  if (status === "received") return "Suas peças estão conosco e serão preparadas para a fornada.";
  if (status === "awaiting_firing") return "Suas peças estão aguardando a próxima etapa da queima.";
  if (status === "firing")
    return "Suas peças estão no forno. Avisaremos quando o processo avançar.";
  if (status === "cooling") return "A queima terminou e as peças estão resfriando com segurança.";
  if (status === "ready_for_pickup") {
    return pendingAmount > 0
      ? "Suas peças estão prontas. Quite o saldo restante e combine a retirada."
      : "Suas peças estão prontas. Combine a retirada conosco.";
  }
  if (status === "completed")
    return "Pedido concluído. Obrigado por realizar sua queima com o Selá.";
  return "Estamos atualizando seu pedido. Entre em contato conosco se precisar de ajuda.";
}

function SelaLogo({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "earth";
  className?: string;
}) {
  if (tone === "earth") {
    return (
      <div
        role="img"
        aria-label="Selá Queimas"
        className={className}
        style={{
          backgroundColor: "#87480d",
          WebkitMaskImage: "url(/sela-queimas-logo.png)",
          maskImage: "url(/sela-queimas-logo.png)",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          maskSize: "contain",
        }}
      />
    );
  }
  return <img src="/sela-queimas-logo.png" alt="Selá Queimas" className={className} />;
}

function SelaGraphicMarks({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 220" aria-hidden="true" className={className} fill="none">
      <g stroke="currentColor" strokeWidth="12" strokeLinecap="square">
        <path d="M24 54V24h92" />
        <path d="M42 104a34 34 0 0 0 68 0" />
        <path d="M176 24a34 34 0 0 0 68 0" />
        <path d="M184 128a30 30 0 0 0 60 0v-18" />
        <circle cx="318" cy="69" r="38" />
        <path d="M318 31v76M296 36v66M340 36v66" strokeWidth="7" />
        <path d="M398 28c-25 0-25 34 0 34s25 38 0 38" />
        <path d="M476 30a38 38 0 0 0 76 0M476 95a38 38 0 0 0 76 0M480 115l68-13" />
        <circle cx="315" cy="174" r="34" />
        <path d="M281 174h68M315 140v68" strokeWidth="8" />
      </g>
    </svg>
  );
}

function SelaStripe({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundColor: "#c89054",
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0, transparent 5px, rgba(124, 145, 139, .85) 5px, rgba(124, 145, 139, .85) 7px)",
      }}
    />
  );
}

function RentalPublicPage() {
  const [slotId, setSlotId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>();
  const [items, setItems] = useState<RentalItemInput[]>([emptyItem()]);
  const [quote, setQuote] = useState<any>(null);
  const [quoteDetailsOpen, setQuoteDetailsOpen] = useState(false);
  const [name, setName] = useState("");
  const [studioName, setStudioName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [pixQrCode, setPixQrCode] = useState("");
  const [lookupCode, setLookupCode] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

  const pixCopyPaste = useMemo(() => {
    if (!confirmation?.pix_key || !Number(confirmation?.deposit_amount)) return "";
    try {
      return createPixPayload({
        amount: Number(confirmation.deposit_amount),
        studentName: name,
        description: "Reserva " + confirmation.code,
        pixKey: confirmation.pix_key,
      });
    } catch {
      return "";
    }
  }, [confirmation, name]);

  useEffect(() => {
    let active = true;
    if (!pixCopyPaste) {
      setPixQrCode("");
      return;
    }
    QRCode.toDataURL(pixCopyPaste, { errorCorrectionLevel: "M", margin: 1, width: 420 })
      .then((dataUrl) => {
        if (active) setPixQrCode(dataUrl);
      })
      .catch(() => {
        if (active) setPixQrCode("");
      });
    return () => {
      active = false;
    };
  }, [pixCopyPaste]);

  async function copyPixCode() {
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      toast.success("Código PIX copiado!");
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  const { data: info } = useQuery({
    queryKey: ["rental-public-info"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rental_public_info", {
        _workspace_id: RENTAL_WORKSPACE_ID,
      });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });

  const { data: paymentInfo } = useQuery({
    queryKey: ["rental-public-payment-info"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rental_public_payment_info", {
        _workspace_id: RENTAL_WORKSPACE_ID,
      });
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });

  const {
    data: slots = [],
    isLoading: slotsLoading,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: ["rental-public-slots"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("rental_public_slots", {
        _workspace_id: RENTAL_WORKSPACE_ID,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const currency = info?.currency ?? "BRL";
  const publicHeadline =
    !info?.headline || info.headline === "Alugue espaço no nosso forno"
      ? "Agende sua queima"
      : info.headline;
  const slot = useMemo(
    () => (slots as any[]).find((s) => s.id === slotId) ?? null,
    [slots, slotId],
  );
  const estimatedPrice = useMemo(
    () =>
      itemsPrice(items, Number(slot?.price_per_liter ?? 0), Number(slot?.glaze_spacing_cm ?? 1)),
    [items, slot?.glaze_spacing_cm, slot?.price_per_liter],
  );
  const availableDates = useMemo(
    () =>
      (slots as any[])
        .map((entry) => parseLocalDate(entry.firing_date ?? entry.closes_at))
        .filter((entry): entry is Date => Boolean(entry)),
    [slots],
  );
  const slotsForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    const selectedKey = dateKey(selectedDay);
    return (slots as any[]).filter(
      (entry) => (entry.firing_date ?? entry.closes_at) === selectedKey,
    );
  }, [selectedDay, slots]);

  const setItem = (index: number, patch: Partial<RentalItemInput>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
    resetQuote();
  };

  const resetQuote = () => {
    setQuote(null);
    setQuoteDetailsOpen(false);
    setConfirmation(null);
  };

  const getQuote = useMutation({
    mutationFn: async () => {
      if (!slotId) throw new Error("Escolha uma vaga de queima.");
      const payload = normalizeItems(items);
      if (payload.length === 0) throw new Error(RENTAL_ERRORS.invalid_dimensions);
      const { data, error } = await sb.rpc("rental_public_quote", {
        _slot_id: slotId,
        _items: payload,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(RENTAL_ERRORS[data?.error] ?? "Não foi possível calcular.");
      return data;
    },
    onSuccess: (data) => {
      setQuote(data);
      setQuoteDetailsOpen(false);
      setConfirmation(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  useEffect(() => {
    if (!slotId || normalizeItems(items).length === 0) {
      setQuote(null);
      return;
    }
    const timer = window.setTimeout(() => getQuote.mutate(), 450);
    return () => window.clearTimeout(timer);
    // The item array is the source of truth; the mutation always reads its latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, slotId]);

  const reserve = useMutation({
    mutationFn: async () => {
      if (!slotId) throw new Error("Escolha uma vaga de queima.");
      const payload = normalizeItems(items);
      if (payload.length === 0) throw new Error(RENTAL_ERRORS.invalid_dimensions);
      const { data, error } = await sb.rpc("rental_public_create_order", {
        _slot_id: slotId,
        _name: name,
        _studio_name: studioName,
        _email: email,
        _phone: phone || null,
        _document: document || null,
        _items: payload,
        _notes: notes || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        const base = RENTAL_ERRORS[data?.error] ?? "Não foi possível concluir a reserva.";
        throw new Error(base);
      }
      return data;
    },
    onSuccess: (data) => {
      setConfirmation(data);
      setQuote(null);
      setItems([emptyItem()]);
      setNotes("");
      refetchSlots();
      toast.success("Reserva registrada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lookup = useMutation({
    mutationFn: async () => {
      const code = lookupCode.trim();
      const email = lookupEmail.trim();
      if (!code && !email) {
        throw new Error("Informe o código do pedido ou o e-mail usado na reserva.");
      }
      const { data, error } = await sb.rpc("rental_public_order_status", {
        _code: code || null,
        _email: email || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (!data?.ok) {
        setLookupResult(null);
        toast.error(RENTAL_ERRORS.not_found);
        return;
      }
      setLookupResult(data);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lookupStageIndex = trackingStageIndex(lookupResult?.status);
  const lookupPaid = Number(lookupResult?.paid_amount ?? 0);
  const lookupPending = Number(
    lookupResult?.pending_amount ?? Math.max(Number(lookupResult?.total ?? 0) - lookupPaid, 0),
  );
  const lookupPieceCount = Number(
    lookupResult?.piece_count ??
      (lookupResult?.items ?? []).reduce(
        (sum: number, item: any) => sum + Number(item.quantity ?? 0),
        0,
      ),
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="relative overflow-hidden border-b bg-primary text-primary-foreground">
        <SelaGraphicMarks className="pointer-events-none absolute -right-24 top-8 hidden w-[620px] text-primary-foreground opacity-[0.09] lg:block" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:py-14">
          <SelaLogo className="h-20 w-32 self-start object-contain sm:h-24 sm:w-40" />
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.24em] opacity-75">
              Reserva online de forno
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{publicHeadline}</h1>
            {info?.description ? (
              <p className="mt-4 max-w-xl text-sm leading-6 opacity-85 sm:text-base">
                {info.description}
              </p>
            ) : (
              <p className="mt-4 max-w-xl text-sm leading-6 opacity-85 sm:text-base">
                Escolha uma data, informe as medidas das suas peças e saiba o valor antes de
                reservar.
              </p>
            )}
          </div>
          <div className="grid max-w-3xl grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {["Escolha a data", "Informe as peças", "Reserve com 50%", "Entregue no Selá"].map(
              (label, index) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-[10px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  {label}
                </div>
              ),
            )}
          </div>
        </div>
      </header>
      <SelaStripe className="h-3 border-b border-primary/10" />

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:py-10">
        {/* 1. Vagas */}
        <Card className="overflow-hidden border-primary/15 shadow-sm">
          <SelaStripe className="h-2" />
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                1
              </span>
              <div>
                <CardTitle className="text-xl">Escolha a data da queima</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Os dias destacados possuem vagas abertas para reserva.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando datas…
              </div>
            ) : (slots as any[]).length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <CalendarDays className="mx-auto mb-3 size-8 text-primary/60" />
                <p className="font-medium">Novas datas em breve</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nenhuma queima está aberta para reserva neste momento.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                <div className="rounded-xl border bg-muted/20 p-2">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    selected={selectedDay}
                    onSelect={(day) => {
                      setSelectedDay(day);
                      setSlotId(null);
                      resetQuote();
                    }}
                    disabled={(day) =>
                      !availableDates.some((available) => dateKey(available) === dateKey(day))
                    }
                    modifiers={{ available: availableDates }}
                    modifiersClassNames={{
                      available: "font-semibold text-primary",
                    }}
                    className="mx-auto w-full [--cell-size:2.65rem]"
                  />
                  <div className="flex flex-wrap justify-center gap-4 border-t px-2 pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-primary" /> Disponível
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {!selectedDay ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center text-muted-foreground">
                      <CalendarDays className="mb-3 size-8 text-primary/50" />
                      <p className="font-medium text-foreground">Selecione um dia no calendário</p>
                      <p className="mt-1 max-w-sm text-sm">
                        Depois, escolha a modalidade disponível para essa data.
                      </p>
                    </div>
                  ) : slotsForSelectedDay.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Não há vagas disponíveis neste dia.
                    </p>
                  ) : (
                    slotsForSelectedDay.map((s) => {
                      const selected = s.id === slotId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSlotId(s.id);
                            resetQuote();
                          }}
                          className={`w-full rounded-xl border p-5 text-left transition-all ${
                            selected
                              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                              : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-base font-semibold">{s.title}</span>
                            <Badge variant="default">
                              {s.firing_type === "biscuit"
                                ? "Biscoito"
                                : s.firing_type === "glaze"
                                  ? "Esmalte"
                                  : "Queima especial"}
                            </Badge>
                          </div>
                          {s.description && (
                            <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                          )}
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <span className="flex items-center gap-1.5">
                              <Flame className="size-3.5" /> Queima: {displayDate(s.firing_date)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock3 className="size-3.5" /> Inscrições até{" "}
                              {displayDate(s.closes_at)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Check className="size-3.5" /> Retirada: {displayDate(s.pickup_date)}
                            </span>
                            {s.kiln_name && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="size-3.5" /> {s.kiln_name}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Peças + orçamento */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                2
              </span>
              <div>
                <CardTitle className="text-xl">Conte sobre suas peças</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  O valor é atualizado automaticamente conforme você informa as medidas.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {slot && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{slot.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {displayDate(slot.firing_date)} · retirada {displayDate(slot.pickup_date)}
                  </p>
                </div>
                <Badge variant="outline">
                  {slot.firing_type === "biscuit"
                    ? "Queima de biscoito"
                    : slot.firing_type === "glaze"
                      ? "Queima de esmalte"
                      : "Queima especial"}
                </Badge>
              </div>
            )}
            {items.map((item, index) => (
              <div key={index} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Peça</Label>
                  <Input
                    value={item.piece_name as string}
                    placeholder="Vaso"
                    onChange={(e) => setItem(index, { piece_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Alt. (cm)</Label>
                  <Input
                    inputMode="decimal"
                    value={item.height_cm as string}
                    onChange={(e) => setItem(index, { height_cm: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Larg. (cm)</Label>
                  <Input
                    inputMode="decimal"
                    value={item.width_cm as string}
                    onChange={(e) => setItem(index, { width_cm: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Prof. (cm)</Label>
                  <Input
                    inputMode="decimal"
                    value={item.depth_cm as string}
                    onChange={(e) => setItem(index, { depth_cm: e.target.value })}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Qtd.</Label>
                    <Input
                      inputMode="numeric"
                      value={item.quantity as string}
                      onChange={(e) => setItem(index, { quantity: e.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={items.length === 1}
                    onClick={() => {
                      setItems((prev) => prev.filter((_, i) => i !== index));
                      resetQuote();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setItems((prev) => [...prev, emptyItem()]);
                  resetQuote();
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar peça
              </Button>
              {slot && (
                <span className="text-sm text-muted-foreground">
                  Estimativa: {formatCurrency(estimatedPrice, currency)}
                </span>
              )}
              {getQuote.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Atualizando orçamento…
                </span>
              )}
            </div>

            {quote && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <p className="font-medium">Orçamento — {quote.slot_title}</p>
                <div className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(Number(quote.total), currency)}</span>
                </div>
                <Collapsible
                  open={quoteDetailsOpen}
                  onOpenChange={setQuoteDetailsOpen}
                  className="mt-3"
                >
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      {quoteDetailsOpen ? "Ocultar informações" : "Mais informações"}
                      <ChevronDown
                        className={`ml-2 size-4 transition-transform ${
                          quoteDetailsOpen ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 rounded-lg border bg-background p-4">
                    <p className="text-xs leading-5 text-muted-foreground">
                      O valor é calculado automaticamente a partir das dimensões e da quantidade
                      informadas para cada peça, usando o coeficiente da modalidade de queima.
                    </p>
                    <div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.04] px-3 py-2.5 text-sm">
                      <span className="text-muted-foreground">Coeficiente utilizado: </span>
                      <strong>
                        {(Number(quote.price_per_liter) / 1000).toLocaleString("pt-BR", {
                          minimumFractionDigits: 3,
                          maximumFractionDigits: 6,
                        })}
                      </strong>
                      <span className="text-muted-foreground"> por cm³</span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Valor por unidade = altura × largura × profundidade × coeficiente.
                      </p>
                      <p className="mt-1 text-xs font-medium text-primary">
                        Margem das bordas: somamos{" "}
                        {Number(quote.glaze_spacing_cm ?? 1).toLocaleString("pt-BR")} cm ao
                        comprimento e à profundidade. A altura não é alterada.
                      </p>
                    </div>
                    <ul className="mt-3 divide-y text-sm">
                      {(quote.items ?? []).map((line: any, i: number) => {
                        const coefficient = Number(quote.price_per_liter) / 1000;
                        const unitPrice = Number(line.unit_price);
                        const calculationWidth = Number(line.calculation_width_cm ?? line.width_cm);
                        const calculationDepth = Number(line.calculation_depth_cm ?? line.depth_cm);
                        return (
                          <li
                            key={i}
                            className="flex flex-col justify-between gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4"
                          >
                            <span>
                              <span className="font-medium">{line.piece_name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {line.height_cm} × {line.width_cm} × {line.depth_cm} cm ·{" "}
                                {line.quantity}{" "}
                                {Number(line.quantity) === 1 ? "unidade" : "unidades"}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {line.height_cm} × {calculationWidth.toLocaleString("pt-BR")} ×{" "}
                                {calculationDepth.toLocaleString("pt-BR")} ×{" "}
                                {coefficient.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 6,
                                })}{" "}
                                = {formatCurrency(unitPrice, currency)} por unidade
                              </span>
                            </span>
                            <span className="text-left sm:text-right">
                              <span className="font-medium">
                                {formatCurrency(Number(line.total_price), currency)}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {formatCurrency(unitPrice, currency)} por unidade
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
                <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
                  <div className="rounded-md bg-background p-3">
                    <p className="text-xs text-muted-foreground">Entrada para reservar</p>
                    <p className="font-semibold">
                      {formatCurrency(
                        Number(quote.total) * (Number(paymentInfo?.deposit_percentage ?? 50) / 100),
                        currency,
                      )}
                    </p>
                  </div>
                  <div className="rounded-md bg-background p-3">
                    <p className="text-xs text-muted-foreground">Saldo na retirada</p>
                    <p className="font-semibold">
                      {formatCurrency(
                        Number(quote.total) *
                          (1 - Number(paymentInfo?.deposit_percentage ?? 50) / 100),
                        currency,
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Reserva */}
        <Card className="border-primary/15 shadow-sm">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                3
              </span>
              <div>
                <CardTitle className="text-xl">Seus dados e reserva</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use um WhatsApp e e-mail que você consulte com frequência.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Nome do responsável</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Nome do ateliê</Label>
                <Input value={studioName} onChange={(e) => setStudioName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">CNPJ (opcional)</Label>
                <Input value={document} onChange={(e) => setDocument(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {info?.terms && <p className="text-xs text-muted-foreground">{info.terms}</p>}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Seus dados serão utilizados somente para identificar a reserva e entrar em contato
              sobre suas peças.
            </div>
            <Button
              type="button"
              onClick={() => reserve.mutate()}
              disabled={
                !slotId ||
                !quote ||
                !name.trim() ||
                !studioName.trim() ||
                !email.trim() ||
                !phone.trim() ||
                reserve.isPending
              }
            >
              {reserve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar reserva e ver PIX
            </Button>

            {confirmation && (
              <div className="rounded-lg border border-primary bg-accent/40 p-4 text-sm">
                <p className="font-semibold">Reserva registrada!</p>
                <p className="mt-1">
                  Código: <span className="font-mono">{confirmation.code}</span> ·{" "}
                  {items.reduce((sum, item) => sum + Math.max(Number(item.quantity) || 1, 1), 0)}{" "}
                  peças
                  {" · "}
                  {formatCurrency(Number(confirmation.total), currency)}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {confirmation.firing_date ? `Queima: ${confirmation.firing_date}` : ""}
                  {confirmation.firing_date && confirmation.pickup_date ? " · " : ""}
                  {confirmation.pickup_date ? `Retirada prevista: ${confirmation.pickup_date}` : ""}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Entrada via PIX</span>
                    <p className="font-semibold">
                      {formatCurrency(Number(confirmation.deposit_amount), currency)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Saldo na retirada</span>
                    <p className="font-semibold">
                      {formatCurrency(Number(confirmation.balance_amount), currency)}
                    </p>
                  </div>
                </div>
                {pixCopyPaste && (
                  <div className="mt-4 rounded-xl border border-primary/20 bg-background/80 p-4">
                    <div className="mb-4">
                      <p className="font-semibold">Pague a entrada para confirmar</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Escaneie o QR Code ou copie o código PIX abaixo no aplicativo do seu banco.
                      </p>
                    </div>
                    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
                      <div className="mx-auto flex size-[180px] items-center justify-center rounded-xl border bg-white p-2">
                        {pixQrCode ? (
                          <img
                            src={pixQrCode}
                            alt={`QR Code PIX da reserva ${confirmation.code}`}
                            className="size-full"
                          />
                        ) : (
                          <Loader2 className="size-6 animate-spin text-primary" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-3">
                        <div>
                          <Label className="text-xs">PIX copia e cola</Label>
                          <div className="mt-1 break-all rounded-lg border bg-white p-3 font-mono text-[11px] leading-5 text-foreground">
                            {pixCopyPaste}
                          </div>
                        </div>
                        <Button type="button" className="w-full sm:w-auto" onClick={copyPixCode}>
                          <Copy className="mr-2 size-4" />
                          Copiar código PIX
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Chave PIX: <span className="font-mono">{confirmation.pix_key}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {confirmation.address && (
                  <p className="mt-1 text-muted-foreground">
                    Entrega e retirada: {confirmation.address}
                  </p>
                )}
                {paymentInfo?.customer_instructions && (
                  <p className="mt-1 text-muted-foreground">{paymentInfo.customer_instructions}</p>
                )}
                <p className="mt-1 text-muted-foreground">
                  Guarde o código para acompanhar o pedido. Entraremos em contato
                  {info?.contact_email ? ` (${info.contact_email})` : ""} para confirmar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4. Consultar pedido */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acompanhar pedido</CardTitle>
            <p className="text-sm text-muted-foreground">
              Consulte pelo código, pelo e-mail cadastrado ou pelos dois. Se houver mais de um
              pedido no mesmo e-mail, mostraremos primeiro o mais recente.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                aria-label="Código do pedido"
                placeholder="Código do pedido (opcional)"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
              />
              <Input
                aria-label="E-mail usado na reserva"
                type="email"
                placeholder="E-mail cadastrado (opcional)"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => lookup.mutate()}
                disabled={lookup.isPending}
              >
                <Search className="mr-2 h-4 w-4" /> Consultar
              </Button>
            </div>
            {lookupResult && (
              <div className="space-y-5 rounded-xl border border-primary/20 bg-primary/[0.03] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{lookupResult.slot_title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pedido <span className="font-mono">{lookupResult.code}</span> · realizado em{" "}
                      {displayDateTime(lookupResult.created_at)}
                    </p>
                  </div>
                  <Badge
                    variant={lookupResult.status === "cancelled" ? "destructive" : "default"}
                    className="text-xs"
                  >
                    {RENTAL_ORDER_STATUS[lookupResult.status] ?? "Em atualização"}
                  </Badge>
                </div>

                {lookupResult.status !== "cancelled" && (
                  <div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Etapa do pedido
                    </p>
                    <div className="grid grid-cols-5 gap-1">
                      {trackingStages.map((stage, index) => {
                        const reached = index <= lookupStageIndex;
                        return (
                          <div key={stage} className="min-w-0 text-center">
                            <div
                              className={`mx-auto flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${
                                reached
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/30 bg-background text-muted-foreground"
                              }`}
                            >
                              {index < lookupStageIndex ? (
                                <Check className="size-3.5" />
                              ) : (
                                index + 1
                              )}
                            </div>
                            <div
                              className={`mt-1.5 h-1 rounded-full ${
                                reached ? "bg-primary" : "bg-muted"
                              }`}
                            />
                            <p
                              className={`mt-1 text-[10px] leading-tight sm:text-xs ${
                                reached ? "font-medium text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {stage}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CircleDollarSign className="size-3.5" /> Valor total
                    </p>
                    <p className="mt-1 font-semibold">
                      {formatCurrency(Number(lookupResult.total), currency)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-emerald-600" /> Valor pago
                    </p>
                    <p className="mt-1 font-semibold text-emerald-700">
                      {formatCurrency(lookupPaid, currency)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" /> Falta pagar
                    </p>
                    <p className="mt-1 font-semibold">{formatCurrency(lookupPending, currency)}</p>
                  </div>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Situação do pagamento</p>
                    <p className="mt-0.5 font-medium">
                      {RENTAL_PAYMENT_STATUS[lookupResult.payment_status] ?? "Em atualização"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Data da queima</p>
                    <p className="mt-0.5 font-medium">{displayDate(lookupResult.firing_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Previsão de retirada</p>
                    <p className="mt-0.5 font-medium">{displayDate(lookupResult.pickup_date)}</p>
                  </div>
                </div>

                <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <PackageCheck className="size-4 text-primary" /> Peças do pedido
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lookupPieceCount}{" "}
                      {lookupPieceCount === 1 ? "peça cadastrada" : "peças cadastradas"}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {(lookupResult.items ?? []).map((item: any, index: number) => (
                        <li key={index} className="flex justify-between gap-3">
                          <span>
                            {item.piece_name} × {item.quantity}
                          </span>
                          <span>{formatCurrency(Number(item.total_price), currency)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Pagamentos</p>
                    <div className="mt-2 space-y-2">
                      {(lookupResult.payments ?? []).map((payment: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center justify-between gap-3 rounded-md bg-background p-2 text-sm"
                        >
                          <span>
                            <span className="font-medium">
                              {payment.type === "deposit" ? "Entrada" : "Saldo"}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {RENTAL_PAYMENT_STATUS[payment.status] ?? "Em atualização"}
                              {payment.paid_at ? ` · pago em ${displayDate(payment.paid_at)}` : ""}
                            </span>
                          </span>
                          <span className="font-medium">
                            {formatCurrency(Number(payment.amount), currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-accent/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Próximo passo
                  </p>
                  <p className="mt-1 text-sm">{nextStepFor(lookupResult.status, lookupPending)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <footer className="relative mt-4 overflow-hidden rounded-2xl border border-[#392c29]/10 bg-[#b2b3a3] px-6 py-7 text-[#392c29] shadow-sm sm:px-8">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 hidden w-1/2 opacity-[0.12] sm:block"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #382b28 0, #382b28 4px, transparent 4px, transparent 11px)",
              maskImage: "linear-gradient(90deg, transparent, black 35%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, black 35%)",
            }}
          />
          <div className="relative grid items-center gap-6 sm:grid-cols-[1fr_auto]">
            <div>
              <SelaLogo tone="earth" className="h-16 w-28 sm:h-20 sm:w-36" />
              <p className="mt-2 max-w-xs text-xs leading-5 text-[#392c29]/70">
                Queimas cuidadosas para peças feitas com intenção.
              </p>
            </div>
            <div className="w-full rounded-xl border border-[#87480d]/15 bg-[#faf5e7]/95 px-5 py-4 shadow-sm sm:w-[360px] sm:px-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#87480d]">
                Selá Queimas
              </p>
              <p className="mt-1 text-lg font-semibold leading-snug text-[#392c29]">
                Do seu ateliê ao nosso forno.
              </p>
              <p className="mt-2 text-sm font-medium leading-5 text-[#392c29]/80">
                {info?.contact_phone || info?.contact_email
                  ? [info?.contact_phone, info?.contact_email].filter(Boolean).join(" · ")
                  : "Selá Cerâmica"}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
