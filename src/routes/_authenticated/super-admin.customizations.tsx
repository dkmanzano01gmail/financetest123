import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useIsSuperAdmin } from "@/hooks/use-super-admin";
import { adminApproveRequest, adminRejectRequest } from "@/lib/customizations.functions";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Loader2, ShieldCheck, Search, Clock3, CircleCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/super-admin/customizations")({
  ssr: false,
  component: SuperAdminCustomizationsPage,
});

type Decision = "approved" | "rejected" | null;

type AdminHistoryRow = {
  id: string;
  workspace_id: string;
  workspace_name: string | null;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  request_text: string;
  request_type: string;
  status: string;
  complexity: string | null;
  estimated_credits: number;
  target_scope: string;
  created_at: string;
  tested_at: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  admin_decision: Decision;
  admin_decided_at: string | null;
  admin_actor_name: string | null;
  admin_actor_email: string | null;
  user_decision: Decision;
  user_decided_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  interpreting: "Analisando pedido",
  in_review: "Em análise",
  needs_admin_review: "Aguardando administrador",
  approved_for_development: "Aprovada para desenvolvimento",
  testing: "Em teste com o usuário",
  approved: "Aprovada pelo usuário",
  rejected: "Rejeitada pelo usuário",
  rejected_by_admin: "Rejeitada pelo administrador",
  discarded: "Descartada",
};

const STATUS_STYLES: Record<string, string> = {
  interpreting: "border-blue-200 bg-blue-50 text-blue-800",
  in_review: "border-blue-200 bg-blue-50 text-blue-800",
  needs_admin_review: "border-amber-200 bg-amber-50 text-amber-800",
  approved_for_development: "border-violet-200 bg-violet-50 text-violet-800",
  testing: "border-orange-200 bg-orange-50 text-orange-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  rejected_by_admin: "border-red-200 bg-red-50 text-red-800",
  discarded: "border-border bg-muted text-muted-foreground",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

function formatAuditDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SuperAdminCustomizationsPage() {
  const { data: isAdmin, isLoading: checkingAdmin } = useIsSuperAdmin();
  const qc = useQueryClient();
  const approveFn = useServerFn(adminApproveRequest);
  const rejectFn = useServerFn(adminRejectRequest);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: history, isLoading } = useQuery({
    queryKey: ["admin-customization-history"],
    enabled: !!isAdmin,
    refetchInterval: 10_000,
    queryFn: async () => {
      const callHistoryRpc = supabase.rpc as unknown as (
        functionName: string,
      ) => Promise<{ data: AdminHistoryRow[] | null; error: Error | null }>;
      const { data, error } = await callHistoryRpc("get_admin_customization_history");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => history ?? [], [history]);
  const queue = rows.filter((row) => row.status === "needs_admin_review");
  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!term) return true;
      return [row.user_name, row.user_email, row.workspace_name, row.request_text]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [rows, search, statusFilter]);

  const approve = useMutation({
    mutationFn: async (req: AdminHistoryRow) => approveFn({ data: { request_id: req.id } }),
    onSuccess: (row: unknown) => {
      const result = row as { status?: string } | null;
      qc.invalidateQueries({ queryKey: ["admin-customization-history"] });
      toast.success(
        result?.status === "approved_for_development"
          ? "Aprovado para desenvolvimento. O prompt foi enviado por e-mail."
          : "Aprovado. Enviado para teste no workspace do usuário.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      rejectFn({ data: { request_id: id, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-customization-history"] });
      toast.success("Pedido recusado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (checkingAdmin) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const completedCount = rows.filter((row) => row.status === "approved").length;
  const rejectedCount = rows.filter((row) =>
    ["rejected", "rejected_by_admin", "discarded"].includes(row.status),
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title="Aprovações e histórico"
        description="Acompanhe todos os pedidos de personalização, responsáveis, decisões e datas."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Todos os pedidos"
          value={rows.length}
          icon={<Clock3 className="h-4 w-4" />}
        />
        <SummaryCard
          label="Aguardando sua decisão"
          value={queue.length}
          icon={<ShieldCheck className="h-4 w-4" />}
          emphasis={queue.length > 0}
        />
        <SummaryCard
          label="Aprovados pelo usuário"
          value={completedCount}
          icon={<CircleCheck className="h-4 w-4" />}
        />
        <SummaryCard
          label="Rejeitados/descartados"
          value={rejectedCount}
          icon={<X className="h-4 w-4" />}
        />
      </div>

      {queue.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Aguardando sua decisão</h2>
            <Badge variant="secondary">{queue.length}</Badge>
          </div>
          <div className="space-y-3">
            {queue.map((request) => (
              <AdminRow
                key={request.id}
                req={request}
                approving={approve.isPending}
                rejecting={reject.isPending}
                onApprove={() => approve.mutate(request)}
                onReject={(reason) => reject.mutate({ id: request.id, reason })}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3">
          <h2 className="font-medium">Todos os pedidos</h2>
          <p className="text-sm text-muted-foreground">
            Histórico administrativo completo, do envio à decisão final do usuário.
          </p>
        </div>

        <Card className="mb-3">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por usuário, e-mail, workspace ou pedido…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum pedido encontrado com esses filtros.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[1180px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[210px]">Usuário</TableHead>
                      <TableHead className="w-[360px]">Pedido</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Solicitado em</TableHead>
                      <TableHead>Decisão do administrador</TableHead>
                      <TableHead>Decisão do usuário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((request) => (
                      <HistoryRow key={request.id} request={request} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </PageContainer>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  emphasis = false,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-amber-300 bg-amber-50/60" : undefined}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center justify-between text-muted-foreground">
          <span className="text-xs uppercase tracking-wide">{label}</span>
          {icon}
        </div>
        <div className="font-mono text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}

function HistoryRow({ request }: { request: AdminHistoryRow }) {
  return (
    <TableRow className="align-top">
      <TableCell>
        <div className="font-medium">{request.user_name ?? "Usuário"}</div>
        <div className="text-xs text-muted-foreground">
          {request.user_email ?? "E-mail não disponível"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {request.workspace_name ?? "Workspace"}
        </div>
      </TableCell>
      <TableCell>
        <div className="whitespace-normal font-medium leading-snug">{request.request_text}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">
            {request.target_scope === "workspace" ? "Workspace" : "Somente usuário"}
          </Badge>
          {request.complexity && <Badge variant="secondary">{request.complexity}</Badge>}
          <Badge variant="secondary">~{request.estimated_credits} créditos</Badge>
        </div>
        {request.rejection_reason && (
          <div className="mt-2 text-xs text-red-700">Motivo: {request.rejection_reason}</div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={STATUS_STYLES[request.status]}>
          {statusLabel(request.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatAuditDate(request.created_at)}
      </TableCell>
      <TableCell>
        <DecisionCell
          decision={request.admin_decision}
          date={request.admin_decided_at}
          actor={request.admin_actor_name ?? request.admin_actor_email}
          waiting={request.status === "needs_admin_review"}
          emptyLabel="Não necessária"
        />
      </TableCell>
      <TableCell>
        <DecisionCell
          decision={request.user_decision}
          date={request.user_decided_at}
          actor={request.user_name}
          waiting={request.status === "testing"}
          emptyLabel="Ainda não enviada para decisão"
        />
      </TableCell>
    </TableRow>
  );
}

function DecisionCell({
  decision,
  date,
  actor,
  waiting,
  emptyLabel,
}: {
  decision: Decision;
  date: string | null;
  actor: string | null;
  waiting: boolean;
  emptyLabel: string;
}) {
  if (!decision) {
    return (
      <div className="text-xs text-muted-foreground">
        {waiting ? <Badge variant="secondary">Aguardando</Badge> : emptyLabel}
      </div>
    );
  }
  const approved = decision === "approved";
  return (
    <div className="space-y-1">
      <Badge
        variant="outline"
        className={
          approved
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }
      >
        {approved ? "Aprovado" : "Rejeitado"}
      </Badge>
      <div className="text-xs text-muted-foreground">{formatAuditDate(date)}</div>
      {actor && <div className="max-w-44 truncate text-xs text-muted-foreground">por {actor}</div>}
    </div>
  );
}

function AdminRow({
  req,
  approving,
  rejecting,
  onApprove,
  onReject,
}: {
  req: AdminHistoryRow;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">
              {req.user_name ?? "Usuário"} · {req.user_email ?? "sem e-mail"} ·{" "}
              {req.workspace_name ?? "Workspace"}
            </div>
            <div className="font-medium">{req.request_text}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{req.complexity ?? req.request_type ?? "other"}</Badge>
            <Badge variant="secondary">~{req.estimated_credits} créditos</Badge>
            <span className="text-xs text-muted-foreground">{formatAuditDate(req.created_at)}</span>
          </div>
        </div>
        {showReject ? (
          <div className="space-y-2">
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
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
                {rejecting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
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
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1 h-3.5 w-3.5" />
              )}
              Aprovar pedido
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowReject(true)}>
              <X className="mr-1 h-3.5 w-3.5" />
              Recusar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
