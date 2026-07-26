import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/feedback")({ component: FeedbackPage });
const sb = supabase as any;

const TYPES = [
  ["general", "Comentário geral"],
  ["improvement", "Melhoria"],
  ["bug", "Erro/bug"],
  ["idea", "Ideia nova"],
  ["question", "Dúvida"],
] as const;
const STATUSES = [
  ["new", "Novo"],
  ["reviewing", "Em análise"],
  ["resolved", "Resolvido"],
  ["archived", "Arquivado"],
] as const;
const labelFor = (items: readonly (readonly [string, string])[], value: string) =>
  items.find(([key]) => key === value)?.[1] ?? value;

function FeedbackPage() {
  const { workspace } = useCurrentWorkspace();
  const wsId = workspace?.id;
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [type, setType] = useState("general");
  const [comment, setComment] = useState("");

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["feedback_comments", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("feedback_comments")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () =>
      (rows as any[]).filter(
        (row) =>
          (typeFilter === "all" || row.type === typeFilter) &&
          (statusFilter === "all" || row.status === statusFilter),
      ),
    [rows, typeFilter, statusFilter],
  );
  const counts = useMemo(() => {
    const result = { total: rows.length, new: 0, reviewing: 0, resolved: 0 };
    for (const row of rows as any[]) {
      if (row.status in result) (result as any)[row.status] += 1;
    }
    return result;
  }, [rows]);

  const create = useMutation({
    mutationFn: async () => {
      const clean = comment.trim();
      if (!clean) throw new Error("Escreva um comentário antes de enviar.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb.from("feedback_comments").insert({
        workspace_id: wsId,
        page: pathname || "Não informado",
        type,
        comment: clean,
        device: typeof navigator === "undefined" ? null : navigator.userAgent,
        status: "new",
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["feedback_comments"] });
      toast.success("Comentário enviado. Obrigado pelo feedback!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await sb
        .from("feedback_comments")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_comments"] }),
    onError: (err: Error) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("feedback_comments")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback_comments"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <PageContainer>
      <PageHeader title="Comentários" description="Ideias, dúvidas, melhorias e erros do aplicativo" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-4">
        <Stat label="Total" value={counts.total} />
        <Stat label="Novos" value={counts.new} />
        <Stat label="Em análise" value={counts.reviewing} />
        <Stat label="Resolvidos" value={counts.resolved} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-[220px_1fr]">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Comentário</Label>
              <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Conte o que pode melhorar, um erro encontrado ou uma nova ideia..." />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !comment.trim()}>
              <Plus className="mr-1 h-4 w-4" />Enviar comentário
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os status</SelectItem>{STATUSES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {error ? <div className="text-sm text-destructive">{(error as Error).message}</div> : isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Nenhum comentário encontrado" />
      ) : (
        <div className="space-y-3">
          {filtered.map((row: any) => (
            <Card key={row.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{new Date(row.created_at).toLocaleString("pt-BR")}</span>
                      <span>· {labelFor(TYPES, row.type)}</span>
                      <span>· {row.page}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{row.comment}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Select value={row.status} onValueChange={(status) => updateStatus.mutate({ id: row.id, status })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" title="Excluir" onClick={() => remove.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-mono text-2xl">{value}</div></CardContent></Card>;
}
