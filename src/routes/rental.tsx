import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import {
  RENTAL_ERRORS,
  RENTAL_WORKSPACE_ID,
  itemsVolumeLiters,
  normalizeItems,
  type RentalItemInput,
} from "@/lib/rental";
import { Flame, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rental")({
  head: () => ({
    meta: [
      { title: "Selá Rental — Alugue espaço no forno" },
      {
        name: "description",
        content:
          "Reserve espaço nas queimas do ateliê Selá Cerâmica: escolha a vaga, calcule o orçamento por litro e faça sua reserva online.",
      },
      { property: "og:title", content: "Selá Rental — Alugue espaço no forno" },
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

function RentalPublicPage() {
  const [slotId, setSlotId] = useState<string | null>(null);
  const [items, setItems] = useState<RentalItemInput[]>([emptyItem()]);
  const [quote, setQuote] = useState<any>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

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

  const { data: slots = [], isLoading: slotsLoading, refetch: refetchSlots } = useQuery({
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
  const slot = useMemo(
    () => (slots as any[]).find((s) => s.id === slotId) ?? null,
    [slots, slotId],
  );
  const estimatedLiters = useMemo(() => itemsVolumeLiters(items), [items]);

  const setItem = (index: number, patch: Partial<RentalItemInput>) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));

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

  const reserve = useMutation({
    mutationFn: async () => {
      if (!slotId) throw new Error("Escolha uma vaga de queima.");
      const payload = normalizeItems(items);
      if (payload.length === 0) throw new Error(RENTAL_ERRORS.invalid_dimensions);
      const { data, error } = await sb.rpc("rental_public_create_order", {
        _slot_id: slotId,
        _name: name,
        _email: email,
        _phone: phone || null,
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
      <header className="border-b bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-10">
          <div className="flex items-center gap-2 text-sm opacity-80">
            <Flame className="h-4 w-4" />
            Selá Rental
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {info?.headline ?? "Alugue espaço no nosso forno"}
          </h1>
          {info?.description ? (
            <p className="max-w-2xl text-sm opacity-90">{info.description}</p>
          ) : (
            <p className="max-w-2xl text-sm opacity-90">
              Escolha uma queima, informe as dimensões das suas peças e reserve seu espaço. O
              orçamento é calculado por litro ocupado.
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        {/* 1. Vagas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Escolha a queima</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {slotsLoading ? (
              <p className="text-sm text-muted-foreground">Carregando vagas…</p>
            ) : (slots as any[]).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma vaga aberta no momento. Volte em breve.
              </p>
            ) : (
              (slots as any[]).map((s) => {
                const selected = s.id === slotId;
                const pct = Math.min(
                  100,
                  (Number(s.used_liters) / Math.max(Number(s.capacity_liters), 1)) * 100,
                );
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSlotId(s.id);
                      resetQuote();
                    }}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selected ? "border-primary bg-accent/40" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{s.title}</span>
                      <Badge variant="secondary">
                        {formatCurrency(Number(s.price_per_liter), currency)} / L
                      </Badge>
                    </div>
                    {s.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {s.kiln_name && <span>Forno: {s.kiln_name}</span>}
                      {s.firing_date && <span>Queima: {s.firing_date}</span>}
                      {s.pickup_date && <span>Retirada: {s.pickup_date}</span>}
                      {s.closes_at && <span>Inscrições até {s.closes_at}</span>}
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
          </CardContent>
        </Card>

        {/* 2. Peças + orçamento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">2. Suas peças</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-6">
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
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
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
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar peça
              </Button>
              <Button
                type="button"
                onClick={() => getQuote.mutate()}
                disabled={!slotId || getQuote.isPending}
              >
                {getQuote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Calcular orçamento
              </Button>
              <span className="text-sm text-muted-foreground">
                Volume estimado: {estimatedLiters.toFixed(2)} L
              </span>
            </div>

            {quote && (
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-medium">Orçamento — {quote.slot_title}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {(quote.items ?? []).map((line: any, i: number) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>
                        {line.piece_name} × {line.quantity} · {Number(line.volume_liters).toFixed(2)}{" "}
                        L
                      </span>
                      <span>{formatCurrency(Number(line.total_price), currency)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>
                    Total · {Number(quote.total_liters).toFixed(2)} L
                  </span>
                  <span>{formatCurrency(Number(quote.total), currency)}</span>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Reservar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Telefone (opcional)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {info?.terms && <p className="text-xs text-muted-foreground">{info.terms}</p>}
            <Button
              type="button"
              onClick={() => reserve.mutate()}
              disabled={!slotId || reserve.isPending}
            >
              {reserve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar reserva
            </Button>

            {confirmation && (
              <div className="rounded-lg border border-primary bg-accent/40 p-4 text-sm">
                <p className="font-semibold">Reserva registrada!</p>
                <p className="mt-1">
                  Código: <span className="font-mono">{confirmation.code}</span> ·{" "}
                  {Number(confirmation.total_liters).toFixed(2)} L ·{" "}
                  {formatCurrency(Number(confirmation.total), currency)}
                </p>
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
                placeholder="Código (RNT-XXXXXX)"
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

        <footer className="pb-10 text-center text-xs text-muted-foreground">
          {info?.public_name ?? "Selá Rental"}
          {info?.contact_phone ? ` · ${info.contact_phone}` : ""}
        </footer>
      </div>
    </main>
  );
}
