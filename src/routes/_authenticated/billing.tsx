import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Coins, CreditCard, Info, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  LEDGER_TYPE_LABEL,
  PAYMENT_TYPE_LABEL,
  PLANS,
  SUBSCRIPTION_STATUS_LABEL,
} from "@/lib/billing";
import {
  useBillingSettings,
  useCreditPacks,
  useCreditWallet,
  usePayments,
  useSubscription,
} from "@/hooks/use-billing";

export const Route = createFileRoute("/_authenticated/billing")({
  ssr: false,
  component: BillingPage,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function BillingPage() {
  const qc = useQueryClient();
  const { data: subscription, isLoading: loadingSub } = useSubscription();
  const wallet = useCreditWallet();
  const { data: payments } = usePayments();
  const { data: settings } = useBillingSettings();
  const { data: packs } = useCreditPacks();
  const [buyOpen, setBuyOpen] = useState(false);

  const simulation = settings?.simulation_enabled === true;

  const buyMut = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await (supabase as any).rpc("purchase_credit_pack", { _pack_code: code });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-ledger"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      setBuyOpen(false);
      toast.success("Créditos adicionados (compra simulada de ambiente de teste).");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const plan = subscription?.plan_code ? PLANS[subscription.plan_code as "personal" | "atelier"] : null;

  return (
    <PageContainer>
      <PageHeader
        title="Plano e créditos"
        description="Sua assinatura, seu saldo de créditos e o histórico de movimentações."
      />

      {simulation && (
        <Card className="mb-4 border-dashed">
          <CardContent className="flex items-start gap-3 p-4">
            <TriangleAlert className="mt-0.5 h-4 w-4 text-primary" />
            <div className="text-sm">
              <div className="font-medium">Ambiente de teste</div>
              <div className="text-muted-foreground">
                O pagamento real ainda não está conectado. As compras desta tela são simuladas e
                servem apenas para validar o funcionamento.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSub ? (
              <div className="text-sm text-muted-foreground">Carregando…</div>
            ) : subscription ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Plano</span>
                  <span className="text-sm font-medium">
                    {plan?.name ?? subscription.plan_code}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Preço mensal</span>
                  <span className="text-sm font-medium">
                    {formatCurrency(Number(subscription.monthly_price), "BRL", false)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Situação</span>
                  <Badge variant="secondary">
                    {SUBSCRIPTION_STATUS_LABEL[subscription.status] ?? subscription.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Próxima cobrança</span>
                  <span className="text-sm font-medium">
                    {formatDate(subscription.renewal_date ?? subscription.current_period_end)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Créditos do plano</span>
                  <span className="text-sm font-medium">
                    {subscription.included_credits} / mês
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Você ainda não tem uma assinatura ativa. Os planos Selá Pessoal (R$ 49,90 · 2
                créditos) e Selá Atelier (R$ 79,90 · 4 créditos) ficarão disponíveis quando o
                pagamento for conectado.
              </div>
            )}
            <Button variant="outline" className="w-full" disabled>
              <CreditCard className="mr-2 h-4 w-4" /> Gerenciar assinatura — em breve
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Créditos disponíveis" value={String(wallet.available)} />
            <Stat label="Reservados" value={String(wallet.reserved)} hint="Em personalizações aprovadas" />
            <Stat label="Recebidos no mês" value={String(wallet.grantedThisMonth)} hint="Créditos do plano" />
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <p className="max-w-xl text-sm text-muted-foreground">
                  Correções de bug da entrega não consomem novos créditos. Só uma nova mudança de
                  escopo gera nova cobrança.
                </p>
              </div>
              <Button onClick={() => setBuyOpen(true)}>
                <Coins className="mr-2 h-4 w-4" /> Comprar créditos
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>Movimentações de créditos e pagamentos.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="credits">
                <TabsList className="mb-3">
                  <TabsTrigger value="credits">Créditos</TabsTrigger>
                  <TabsTrigger value="payments">Pagamentos</TabsTrigger>
                </TabsList>
                <TabsContent value="credits" className="max-h-[380px] space-y-2 overflow-auto">
                  {wallet.ledger.length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma movimentação de crédito ainda.
                    </div>
                  )}
                  {wallet.ledger.map((row: any) => (
                    <div key={row.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {LEDGER_TYPE_LABEL[row.type] ?? row.type}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.description ?? "—"} · {formatDate(row.created_at)}
                        </div>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          Number(row.credits_delta) >= 0 ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {Number(row.credits_delta) > 0 ? "+" : ""}
                        {Number(row.credits_delta)}
                      </span>
                    </div>
                  ))}
                </TabsContent>
                <TabsContent value="payments" className="max-h-[380px] space-y-2 overflow-auto">
                  {(payments ?? []).length === 0 && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum pagamento registrado ainda.
                    </div>
                  )}
                  {(payments ?? []).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {PAYMENT_TYPE_LABEL[p.type] ?? p.type}
                          {p.is_simulated && (
                            <Badge variant="outline" className="text-[10px]">
                              simulado
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.description ?? "—"} · {formatDate(p.paid_at ?? p.created_at)}
                        </div>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(Number(p.gross_amount), p.currency ?? "BRL", false)}
                      </span>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comprar créditos</DialogTitle>
            <DialogDescription>
              {simulation
                ? "Ambiente de teste: a compra é simulada e registra o crédito imediatamente, sem cobrança real."
                : "O pagamento real ainda não está conectado. Em breve você poderá comprar por aqui."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(packs ?? []).map((pack) => (
              <div key={pack.code} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{pack.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(Number(pack.price) / pack.credits, "BRL", false)} por crédito
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    {formatCurrency(Number(pack.price), "BRL", false)}
                  </span>
                  <Button
                    size="sm"
                    disabled={!simulation || buyMut.isPending}
                    onClick={() => buyMut.mutate(pack.code)}
                  >
                    {buyMut.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {simulation ? "Comprar (simulado)" : "Em breve"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
