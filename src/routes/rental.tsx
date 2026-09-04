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
import { formatCurrency } from "@/lib/format";
import { createPixPayload } from "@/lib/pix-br";
import {
  RENTAL_ERRORS,
  RENTAL_WORKSPACE_ID,
  itemPrice,
  itemsPrice,
  itemsVolumeLiters,
  normalizeItems,
  type RentalItemInput,
} from "@/lib/rental";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Flame,
  Loader2,
  MapPin,
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
          "Reserve espaço nas queimas do ateliê Selá Cerâmica: escolha a vaga, calcule o orçamento por litro e faça sua reserva online.",
      },
      { property: "og:title", content: "Selá Queimas — Agende sua queima" },
      {
        property: "og:description",
        content:
          "Reserve espaço nas queimas do ateliê Selá Cerâmica: orçamento por litro e reserva online.",
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
  const estimatedLiters = useMemo(() => itemsVolumeLiters(items), [items]);
  const estimatedPrice = useMemo(
    () => itemsPrice(items, Number(slot?.price_per_liter ?? 0)),
    [items, slot?.price_per_liter],
  );
  const availableDates = useMemo(
    () =>
      (slots as any[])
        .filter((entry) => Number(entry.available_liters) > 0)
        .map((entry) => parseLocalDate(entry.firing_date ?? entry.closes_at))
        .filter((entry): entry is Date => Boolean(entry)),
    [slots],
  );
  const limitedDates = useMemo(
    () =>
      (slots as any[])
        .filter(
          (entry) =>
            Number(entry.available_liters) > 0 &&
            Number(entry.available_liters) / Math.max(Number(entry.capacity_liters), 1) <= 0.25,
        )
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
        const extra =
          data?.available_liters != null
            ? ` Disponível: ${Number(data.available_liters).toFixed(1)} L.`
            : data?.min_liters != null
              ? ` Mínimo: ${Number(data.min_liters).toFixed(1)} L.`
              : "";
        throw new Error(base + extra);
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
      const { data, error } = await sb.rpc("rental_public_order_status", {
        _code: lookupCode,
        _email: lookupEmail,
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
                    modifiers={{ available: availableDates, limited: limitedDates }}
                    modifiersClassNames={{
                      available: "font-semibold text-primary",
                      limited: "text-amber-700",
                    }}
                    className="mx-auto w-full [--cell-size:2.65rem]"
                  />
                  <div className="flex flex-wrap justify-center gap-4 border-t px-2 pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-primary" /> Disponível
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-amber-500" /> Poucas vagas
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
                      const full = Number(s.available_liters) <= 0;
                      const pct = Math.min(
                        100,
                        (Number(s.used_liters) / Math.max(Number(s.capacity_liters), 1)) * 100,
                      );
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={full}
                          onClick={() => {
                            if (full) return;
                            setSlotId(s.id);
                            resetQuote();
                          }}
                          className={`w-full rounded-xl border p-5 text-left transition-all ${
                            selected
                              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                              : full
                                ? "cursor-not-allowed opacity-60"
                                : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-base font-semibold">{s.title}</span>
                            <Badge variant={full ? "secondary" : "default"}>
                              {full
                                ? "Lotado"
                                : `${formatCurrency(Number(s.price_per_liter), currency)} / L`}
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
                          <div className="mt-3">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {Number(s.available_liters).toFixed(1)} L disponíveis de{" "}
                              {Number(s.capacity_liters).toFixed(1)} L
                            </p>
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
                  {formatCurrency(Number(slot.price_per_liter), currency)} / L
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
              <span className="text-sm text-muted-foreground">
                Volume estimado: {estimatedLiters.toFixed(2)} L
                {slot ? ` · Estimativa: ${formatCurrency(estimatedPrice, currency)}` : ""}
              </span>
              {getQuote.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Atualizando orçamento…
                </span>
              )}
            </div>

            {quote && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <p className="font-medium">Orçamento — {quote.slot_title}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {(quote.items ?? []).map((line: any, i: number) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>
                        {line.piece_name} × {line.quantity} ·{" "}
                        {Number(line.volume_liters).toFixed(2)} L
                      </span>
                      <span className="text-right">
                        {formatCurrency(Number(line.total_price), currency)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatCurrency(
                            itemPrice(
                              {
                                piece_name: line.piece_name,
                                height_cm: line.height_cm,
                                width_cm: line.width_cm,
                                depth_cm: line.depth_cm,
                                quantity: 1,
                              },
                              Number(quote.price_per_liter),
                            ),
                            currency,
                          )}{" "}
                          por unidade
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>Total · {Number(quote.total_liters).toFixed(2)} L</span>
                  <span>{formatCurrency(Number(quote.total), currency)}</span>
                </div>
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
                {!quote.fits && (
                  <p className="mt-2 text-sm text-destructive">
                    Espaço insuficiente: restam {Number(quote.available_liters).toFixed(2)} L nesta
                    queima.
                  </p>
                )}
                {!quote.meets_minimum && (
                  <p className="mt-2 text-sm text-destructive">
                    Volume mínimo desta vaga: {Number(quote.min_liters).toFixed(2)} L.
                  </p>
                )}
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
                !quote?.fits ||
                !quote?.meets_minimum ||
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
                  {Number(confirmation.total_liters).toFixed(2)} L ·{" "}
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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                placeholder="Código (SQ-2026-XXXXX)"
                value={lookupCode}
                onChange={(e) => setLookupCode(e.target.value)}
              />
              <Input
                placeholder="E-mail usado na reserva"
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
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">
                  {lookupResult.slot_title} · {lookupResult.status}
                </p>
                <p className="text-muted-foreground">
                  {Number(lookupResult.total_liters).toFixed(2)} L ·{" "}
                  {formatCurrency(Number(lookupResult.total), currency)} · pagamento:{" "}
                  {lookupResult.payment_status}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <footer className="relative mt-4 overflow-hidden rounded-2xl bg-[#b2b3a3] px-6 py-8 text-[#392c29]">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-2/5 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #382b28 0, #382b28 4px, transparent 4px, transparent 11px)",
            }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <SelaLogo tone="earth" className="h-16 w-28" />
            <div className="text-sm">
              <p className="font-medium">Do seu ateliê ao nosso forno.</p>
              <p className="mt-1 text-xs opacity-75">
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
