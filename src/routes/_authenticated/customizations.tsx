import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { useCustomizations } from "@/hooks/use-customizations";
import { submitCustomizationRequest, reprocessPendingRequests } from "@/lib/customizations.functions";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Wand2, Trash2, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customizations")({
  ssr: false,
  component: CustomizationsPage,
});

const PLAN_LABELS: Record<string, string> = {
  personal: "Pessoal · 3 créditos/mês",
  personal_plus: "Pessoal Plus · 8 créditos/mês",
  business: "Negócio · 10 créditos/mês",
  business_pro: "Negócio Pro · 25 créditos/mês",
};

const EXAMPLES = [
  "Recebimentos com o mesmo descritivo todo mês = Aulas regulares",
  "Valores de 290 ou múltiplos = Workshops",
  "Toda transação com Uber deve virar Transporte",
  "Mude o nome de Receitas para Entradas",
  "Quero ocultar o card de saldo no dashboard",
  "Crie um filtro salvo de Gastos da reforma",
];

function CustomizationsPage() {
  const { workspace } = useCurrentWorkspace();
  const wsId = workspace?.id;
  const qc = useQueryClient();
  const submit = useServerFn(submitCustomizationRequest);
  const reprocess = useServerFn(reprocessPendingRequests);

  const [text, setText] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(id);
  }, []);

  // Ensure current credits row exists (surface errors instead of swallowing).
  useEffect(() => {
    if (!wsId) return;
    let cancelled = false;
    (async () => {
      const { error } = await (supabase as any).rpc("ensure_current_credits", { _workspace_id: wsId });
      if (cancelled) return;
      if (error) toast.error(`Não foi possível carregar créditos: ${error.message}`);
      else qc.invalidateQueries({ queryKey: ["credits", wsId] });
    })();
    return () => { cancelled = true; };
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

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Sem workspace");
      return await submit({ data: { workspace_id: wsId, request_text: text } });
    },
    onSuccess: (res: any) => {
      setText("");
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      qc.invalidateQueries({ queryKey: ["credits", wsId] });
      qc.invalidateQueries({ queryKey: ["active-test", wsId] });
      qc.invalidateQueries({ queryKey: ["categories", wsId] });
      qc.invalidateQueries({ queryKey: ["transactions", wsId] });
      qc.invalidateQueries({ queryKey: ["label-overrides", wsId] });
      if (res?.autoApplied) {
        const affected = Number(res?.affected_transactions ?? 0);
        if (affected > 0) {
          toast.success(`Regra criada e aplicada — ${affected} transação(ões) recategorizada(s). Aprove pelo banner no topo para confirmar.`);
        } else {
          toast.success("Personalização em teste. Aprove pelo banner no topo para tornar definitiva.");
        }
      } else {
        toast.success("Pedido enviado para aprovação do admin.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reprocessMut = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Sem workspace");
      return await reprocess({ data: { workspace_id: wsId } });
    },
    onSuccess: (res: any) => {
      toast.success(`${res?.processed ?? 0} pedido(s) reprocessado(s).`);
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      qc.invalidateQueries({ queryKey: ["label-overrides", wsId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasStuck = (requests ?? []).some((r: any) =>
    ["interpreting", "submitted", "pending"].includes(r.status),
  );

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!wsId) throw new Error("Sem workspace");
      const { error } = await (supabase as any)
        .from("customizations")
        .update({ is_active })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      qc.invalidateQueries({ queryKey: ["label-overrides", wsId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      if (!wsId) throw new Error("Sem workspace");
      const { error } = await (supabase as any)
        .from("customizations")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      qc.invalidateQueries({ queryKey: ["label-overrides", wsId] });
      toast.success("Personalização removida");
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!workspace) return null;

  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeActive = Array.isArray(cust?.active) ? cust.active : [];
  const safeAll = Array.isArray(cust?.customizations) ? cust.customizations : [];

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
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending || text.trim().length < 3}
              >
                {submitMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Enviar pedido
              </Button>
              <span className="text-xs text-muted-foreground">Mudanças simples são aplicadas na hora em modo teste. Mudanças avançadas vão para análise do admin.</span>
            </div>
          </CardContent>
        </Card>

        {/* Right: tabs */}
        <Card>
          <CardContent className="p-4">
            <Tabs defaultValue="history">
              <TabsList className="mb-3">
                <TabsTrigger value="history">Histórico</TabsTrigger>
              <TabsTrigger value="active">Ativas ({safeActive.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="space-y-2 max-h-[500px] overflow-auto">
                {hasStuck && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mb-2"
                    onClick={() => reprocessMut.mutate()}
                    disabled={reprocessMut.isPending}
                  >
                    {reprocessMut.isPending
                      ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                    Reprocessar pedidos pendentes
                  </Button>
                )}
                {safeRequests.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">Nenhum pedido ainda.</div>
                )}
                {safeRequests.map((r: any) => (
                  <RequestRow key={r.id} req={r} />
                ))}
              </TabsContent>

              <TabsContent value="active" className="space-y-2 max-h-[500px] overflow-auto">
                {safeActive.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">Nenhuma personalização ativa.</div>
                )}
                {safeAll.map((c) => (
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
                    <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(c.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover personalização?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta personalização será excluída permanentemente e o app voltará ao comportamento padrão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && removeMut.mutate(confirmDelete)}
              disabled={removeMut.isPending}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function RequestRow({ req }: { req: any }) {
  const interp = req.ai_interpretation ?? {};
  const statusColor: Record<string, string> = {
    testing: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    needs_admin_review: "bg-sky-100 text-sky-800",
    rejected: "bg-rose-100 text-rose-800",
    rejected_by_admin: "bg-rose-100 text-rose-800",
    rejected_by_ai: "bg-muted text-muted-foreground",
    interpreting: "bg-muted text-muted-foreground",
    // legacy
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
          {req.ai_classification_reason && (
            <div className="text-xs text-muted-foreground/80 mt-1 italic">{req.ai_classification_reason}</div>
          )}
          {req.rejection_reason && (
            <div className="text-xs text-rose-700 mt-1">Motivo: {req.rejection_reason}</div>
          )}
        </div>
        <Badge className={statusColor[req.status] ?? "bg-muted"}>{statusLabel(req.status)}</Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <Badge variant="outline">{interp.type ?? req.request_type}</Badge>
        <span>~{req.estimated_credits} crédito{req.estimated_credits === 1 ? "" : "s"}</span>
        <span>· {formatDate(req.created_at)}</span>
        {req.auto_applied && <Badge variant="secondary" className="text-[10px]">auto</Badge>}
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  return ({
    interpreting: "Interpretando",
    needs_admin_review: "Em análise",
    testing: "Em teste",
    approved: "Aplicada",
    rejected: "Rejeitada (revertida)",
    rejected_by_admin: "Recusada pelo admin",
    rejected_by_ai: "Descartada",
    waiting_credits: "Aguardando créditos",
    // legacy
    analyzed: "Analisado",
    applied: "Aplicado",
    in_review: "Em análise",
    discarded: "Descartado",
    pending: "Pendente",
  } as Record<string, string>)[s] ?? s;
}
