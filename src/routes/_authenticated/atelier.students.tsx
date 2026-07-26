import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, parseLocaleAmount } from "@/lib/format";
import { Plus, Trash2, Pencil, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/students")({ component: Page });

const sb = supabase as any;
const empty = {
  name: "",
  class_name: "",
  monthly_fee: "0",
  is_active: true,
  notes: "",
};

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(empty);
  const [q, setQ] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["students", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("students")
        .select("*")
        .eq("workspace_id", wsId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r: any) =>
          (statusFilter === "all" || (statusFilter === "active" ? r.is_active : !r.is_active)) &&
          (!q ||
          r.name.toLowerCase().includes(q.toLowerCase()) ||
          (r.class_name ?? "").toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, q, statusFilter],
  );


  const studentSummary = useMemo(() => {
    const active = (rows ?? []).filter((row: any) => row.is_active);
    const groups = new Set(active.map((row: any) => row.class_name).filter(Boolean));
    return {
      active: active.length,
      inactive: (rows ?? []).length - active.length,
      groups: groups.size,
      monthlyRevenue: active.reduce((sum: number, row: any) => sum + Number(row.monthly_fee || 0), 0),
    };
  }, [rows]);
  const save = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error("Informe o nome do aluno.");
      const fee = f.monthly_fee.trim() ? parseLocaleAmount(f.monthly_fee) : 0;
      if (!Number.isFinite(fee)) throw new Error("Mensalidade inválida.");
      const p: any = {
        workspace_id: wsId,
        name: f.name.trim(),
        class_name: f.class_name.trim() || null,
        monthly_fee: fee,
        is_active: f.is_active,
        notes: f.notes.trim() || null,
      };
      const { error } = editId
        ? await sb.from("students").update(p).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("students").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      setEditId(null);
      setF(empty);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await sb
        .from("students")
        .update({ is_active: !r.is_active })
        .eq("id", r.id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["students"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("students")
        .update({ is_active: false })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setDelId(null);
      toast.success("Aluno inativado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(r: any) {
    setEditId(r.id);
    setF({
      name: r.name,
      class_name: r.class_name ?? "",
      monthly_fee: String(r.monthly_fee ?? 0),
      is_active: !!r.is_active,
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Alunos"
        description="Cadastro de alunos, turmas e mensalidades"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setF(empty);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Novo aluno
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 mb-4 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Alunos ativos</div><div className="font-mono text-2xl">{studentSummary.active}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Inativos</div><div className="font-mono text-2xl">{studentSummary.inactive}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Turmas</div><div className="font-mono text-2xl">{studentSummary.groups}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Receita mensal recorrente</div><div className="font-mono text-xl text-income">{formatCurrency(studentSummary.monthlyRevenue, currency, privacy)}</div></CardContent></Card>
      </div>
      <div className="mb-3 flex gap-2">
        <Input placeholder="Buscar por nome ou turma" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option>
        </select>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground p-6">Carregando…</div>
      ) : error ? (
        <div className="text-sm text-destructive p-6">
          Erro ao carregar: {(error as Error).message}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Sem alunos cadastrados" />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Nome</th>
                  <th className="p-3">Turma</th>
                  <th className="p-3 text-right">Mensalidade</th>
                  <th className="p-3">Ativo</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3">{r.class_name ?? "—"}</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(Number(r.monthly_fee ?? 0), currency, privacy)}
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={!!r.is_active}
                        onCheckedChange={() => toggleActive.mutate(r)}
                      />
                    </td>
                    <td className="p-3 flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => edit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDelId(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar aluno" : "Novo aluno"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Turma</Label>
              <Input
                value={f.class_name}
                onChange={(e) => setF({ ...f, class_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mensalidade</Label>
              <Input
                inputMode="decimal"
                value={f.monthly_fee}
                onChange={(e) => setF({ ...f, monthly_fee: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2 flex items-center gap-3">
              <Switch
                checked={f.is_active}
                onCheckedChange={(v) => setF({ ...f, is_active: v })}
              />
              <Label>Ativo</Label>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !f.name.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar aluno?</AlertDialogTitle>
            <AlertDialogDescription>
              O aluno será inativado e continuará disponível no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => delId && del.mutate(delId)}>
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}