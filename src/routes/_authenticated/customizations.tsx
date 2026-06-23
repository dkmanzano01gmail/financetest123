import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { useCustomizations } from "@/hooks/use-customizations";
import { interpretCustomization } from "@/lib/customizations.functions";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Wand2, Trash2, Check, Clock, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customizations")({ component: CustomizationsPage });

const PLAN_LABELS: Record<string, string> = {
  personal: "Pessoal · 3 créditos/mês",
  personal_plus: "Pessoal Plus · 8 créditos/mês",
  business: "Negócio · 10 créditos/mês",
  business_pro: "Negócio Pro · 25 créditos/mês",
};

const EXAMPLES = [
  "Crie um card mostrando quanto gastei com restaurantes este mês",
  "Toda transação com Uber deve virar Transporte",
  "Mude o nome de Receitas para Entradas",
  "Quero ocultar o card de saldo no dashboard",
  "Crie um filtro salvo de Gastos da reforma",
];

function CustomizationsPage() {
  const { workspace } = useCurrentWorkspace();
  const wsId = workspace?.id;
  const qc = useQueryClient();
  const interpret = useServerFn(interpretCustomization);

  const [text, setText] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(id);
  }, []);

  // Ensure current credits row exists
  useEffect(() => {
    if (!wsId) return;
    (supabase as any).rpc("ensure_current_credits", { _workspace_id: wsId }).then(() => {
      qc.invalidateQueries({ queryKey: ["credits", wsId] });
    });
  }, [wsId, qc]);

  const { data: credits } = useQuery({
    queryKey: ["credits", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const now = new Date();
      const { data, error } = await (supabase as any)
        .from("customization_credits")
        .select("*")
        .eq("workspace_id", wsId!)
        .eq("period_month", now.getMonth() + 1)
        .eq("period_year", now.getFullYear())
        .maybeSingle();
      if (error) throw error;
      return data as { credits_included: number; credits_used: number } | null;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["customization-requests", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customization_requests")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cust = useCustomizations(wsId);

  const remaining = credits ? credits.credits_included - credits.credits_used : 0;
  const pct = credits && credits.credits_included > 0
    ? (credits.credits_used / credits.credits_included) * 100
    : 0;

  const interpretMut = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Sem workspace");
      return await interpret({ data: { workspace_id: wsId, request_text: text } });
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      toast.success("Pedido interpretado pela IA");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: async (req: any) => {
      if (!wsId) throw new Error("Sem workspace");
      const interp = req.ai_interpretation ?? {};
      const credits = req.estimated_credits ?? 1;

      // Try consume credits
      const { data: ok, error: ce } = await (supabase as any).rpc("consume_credits", {
        _workspace_id: wsId,
        _request_id: req.id,
        _credits: credits,
        _reason: interp?.summary ?? "Personalização aplicada",
      });
      if (ce) throw new Error(ce.message);
      if (!ok) throw new Error("Créditos insuficientes neste mês.");

      // Side-effect: for new_category, also create the category row
      if (interp.type === "new_category") {
        const cfg = interp.configuration_json ?? {};
        await supabase.from("categories").insert({
          workspace_id: wsId,
          name: cfg.name,
          type: cfg.type ?? "expense",
          color: cfg.color ?? "#c2410c",
          importance_level: cfg.importance_level ?? "flexible",
        } as any);
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { data: created, error } = await (supabase as any)
        .from("customizations")
        .insert({
          workspace_id: wsId,
          type: interp.type ?? "other",
          name: interp.summary?.slice(0, 80) ?? req.request_text.slice(0, 80),
          description: interp.summary ?? null,
          configuration_json: interp.configuration_json ?? {},
          created_by: user!.id,
          request_id: req.id,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      await (supabase as any)
        .from("customization_requests")
        .update({
          status: "applied",
          approved_credits: credits,
          applied_customization_id: created.id,
          approved_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq("id", req.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credits", wsId] });
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      qc.invalidateQueries({ queryKey: ["categories", wsId] });
      toast.success("Personalização aplicada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewMut = useMutation({
    mutationFn: async (req: any) => {
      const { error } = await (supabase as any)
        .from("customization_requests")
        .update({ status: "in_review" })
        .eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      toast.success("Pedido enviado para análise");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const discardMut = useMutation({
    mutationFn: async (req: any) => {
      const { error } = await (supabase as any)
        .from("customization_requests")
        .update({ status: "discarded" })
        .eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customization-requests", wsId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("customizations")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customizations", wsId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("customizations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      toast.success("Personalização removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!workspace) return null;

  return (
    <PageContainer>
      <PageHeader
        title="Personalizações"
        description="Peça mudanças no app em linguagem natural. Personalizações simples são aplicadas na hora consumindo créditos do mês."
      />

      {/* Credits header */}
      <Card className="mb-6">
        <CardContent className="p-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Créditos do mês</span>
              <Badge variant="secondary">{PLAN_LABELS[workspace.plan ?? "personal"] ?? "Pessoal"}</Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-2xl tabular-nums">{remaining}</span>
              <span className="text-sm text-muted-foreground">de {credits?.credits_included ?? 0} restantes</span>
            </div>
            <Progress value={pct} className="mt-2" />
          </div>
          <div className="text-xs text-muted-foreground md:text-right">
            Usados: {credits?.credits_used ?? 0}<br />
            Reinicia no próximo mês
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: novo pedido */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Novo pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLES[exampleIdx]}
              rows={5}
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={() => interpretMut.mutate()}
                disabled={interpretMut.isPending || text.trim().length < 3}
              >
                {interpretMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Interpretar com IA
              </Button>
              <span className="text-xs text-muted-foreground">A IA estima quantos créditos serão usados antes de aplicar.</span>
            </div>
          </CardContent>
        </Card>

        {/* Right: tabs */}
        <Card>
          <CardContent className="p-4">
            <Tabs defaultValue="history">
              <TabsList className="mb-3">
                <TabsTrigger value="history">Histórico</TabsTrigger>
                <TabsTrigger value="active">Ativas ({cust.active.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="space-y-2 max-h-[500px] overflow-auto">
                {(requests ?? []).length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">Nenhum pedido ainda.</div>
                )}
                {(requests ?? []).map((r: any) => (
                  <RequestRow
                    key={r.id}
                    req={r}
                    canAfford={remaining >= (r.estimated_credits ?? 1)}
                    onApply={() => applyMut.mutate(r)}
                    onReview={() => reviewMut.mutate(r)}
                    onDiscard={() => discardMut.mutate(r)}
                    applying={applyMut.isPending}
                  />
                ))}
              </TabsContent>

              <TabsContent value="active" className="space-y-2 max-h-[500px] overflow-auto">
                {cust.active.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">Nenhuma personalização ativa.</div>
                )}
                {cust.customizations.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{c.type}</Badge>
                        <span className="text-sm font-medium truncate">{c.name}</span>
                      </div>
                      {c.description && <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>}
                    </div>
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={(v) => toggleMut.mutate({ id: c.id, is_active: v })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => removeMut.mutate(c.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function RequestRow({
  req,
  canAfford,
  onApply,
  onReview,
  onDiscard,
  applying,
}: {
  req: any;
  canAfford: boolean;
  onApply: () => void;
  onReview: () => void;
  onDiscard: () => void;
  applying: boolean;
}) {
  const interp = req.ai_interpretation ?? {};
  const auto = interp.auto_appliable === true && interp.complexity === "simple";
  const statusColor: Record<string, string> = {
    analyzed: "bg-amber-100 text-amber-800",
    applied: "bg-emerald-100 text-emerald-800",
    in_review: "bg-sky-100 text-sky-800",
    discarded: "bg-muted text-muted-foreground",
    pending: "bg-muted text-muted-foreground",
  };
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm">{req.request_text}</div>
          {interp.summary && <div className="text-xs text-muted-foreground mt-1">{interp.summary}</div>}
        </div>
        <Badge className={statusColor[req.status] ?? "bg-muted"}>{statusLabel(req.status)}</Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <Badge variant="outline">{interp.type ?? req.request_type}</Badge>
        <span>~{req.estimated_credits} crédito{req.estimated_credits === 1 ? "" : "s"}</span>
        <span>· {formatDate(req.created_at)}</span>
      </div>
      {req.status === "analyzed" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {auto ? (
            <Button size="sm" onClick={onApply} disabled={!canAfford || applying}>
              <Check className="w-3.5 h-3.5 mr-1" /> Aplicar agora
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={onReview}>
              <Clock className="w-3.5 h-3.5 mr-1" /> Enviar para análise
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            <X className="w-3.5 h-3.5 mr-1" /> Descartar
          </Button>
          {auto && !canAfford && (
            <span className="text-xs text-destructive self-center">Créditos insuficientes.</span>
          )}
        </div>
      )}
    </div>
  );
}

function statusLabel(s: string) {
  return ({
    analyzed: "Analisado",
    applied: "Aplicado",
    in_review: "Em análise",
    discarded: "Descartado",
    pending: "Pendente",
  } as Record<string, string>)[s] ?? s;
}
