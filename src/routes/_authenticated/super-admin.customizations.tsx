import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useIsSuperAdmin } from "@/hooks/use-super-admin";
import { adminApproveRequest, adminRejectRequest } from "@/lib/customizations.functions";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/super-admin/customizations")({
  ssr: false,
  component: SuperAdminCustomizationsPage,
});

function SuperAdminCustomizationsPage() {
  const { data: isAdmin, isLoading: checkingAdmin } = useIsSuperAdmin();
  const qc = useQueryClient();
  const approveFn = useServerFn(adminApproveRequest);
  const rejectFn = useServerFn(adminRejectRequest);

  const { data: queue, isLoading } = useQuery({
    queryKey: ["admin-queue"],
    enabled: !!isAdmin,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customization_requests")
        .select("*, workspaces(name)")
        .eq("status", "needs_admin_review")
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const approve = useMutation({
    mutationFn: async (req: any) => approveFn({ data: { request_id: req.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-queue"] });
      toast.success("Aprovado. Enviado para teste no workspace do usuário.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      rejectFn({ data: { request_id: id, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-queue"] });
      toast.success("Pedido recusado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (checkingAdmin) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  return (
    <PageContainer>
      <PageHeader
        title="Fila de aprovação"
        description="Pedidos avançados de todos os workspaces aguardando sua decisão."
      />
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <span className="text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${queue?.length ?? 0} pedido(s) aguardando`}
        </span>
      </div>
      <div className="space-y-3">
        {(queue ?? []).length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum pedido para revisar.
            </CardContent>
          </Card>
        )}
        {(queue ?? []).map((r: any) => (
          <AdminRow
            key={r.id}
            req={r}
            approving={approve.isPending}
            rejecting={reject.isPending}
            onApprove={() => approve.mutate(r)}
            onReject={(reason) => reject.mutate({ id: r.id, reason })}
          />
        ))}
      </div>
    </PageContainer>
  );
}

function AdminRow({
  req,
  approving,
  rejecting,
  onApprove,
  onReject,
}: {
  req: any;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const interp = req.ai_interpretation ?? {};
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">
              {req.workspaces?.name ?? "Workspace"}
            </div>
            <div className="font-medium">{req.request_text}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{interp.type ?? "other"}</Badge>
            <Badge variant="secondary">~{req.estimated_credits} créditos</Badge>
            <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
          </div>
        </div>
        {interp.summary && (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Interpretação:</span> {interp.summary}
          </div>
        )}
        {req.ai_classification_reason && (
          <div className="text-xs text-muted-foreground italic">{req.ai_classification_reason}</div>
        )}
        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
          <span className="font-medium text-foreground">Por que veio para análise:</span>{" "}
          {interp.type === "other"
            ? "O pedido não casou com nenhuma primitiva do runtime (renomear, esconder, reordenar, criar categoria/regra, salvar filtro). Implemente como código ou estenda o registry."
            : "Pedido marcado como advanced pela IA."}
        </div>
        {interp.configuration_json && Object.keys(interp.configuration_json).length > 0 && (
          <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-40">
            {JSON.stringify(interp.configuration_json, null, 2)}
          </pre>
        )}
        {showReject ? (
          <div className="space-y-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo da recusa (visível ao usuário)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReject(reason)}
                disabled={rejecting || !reason.trim()}
              >
                {rejecting && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                Confirmar recusa
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowReject(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={onApprove} disabled={approving}>
              {approving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1" />
              )}
              Aprovar e enviar para teste
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(true)}>
              <X className="w-3.5 h-3.5 mr-1" />
              Recusar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
