import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Plus, Trash2, Pencil, CalendarCheck, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/attendance")({ component: Page });
const sb = supabase as any;
const empty = {
  session_date: new Date().toISOString().slice(0, 10),
  session_time: "",
  student_name: "",
  class_name: "",
  record_type: "class",
  status: "present",
  comments: "",
};
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState(empty);
  const [q, setQ] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["attendance", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await sb
          .from("attendance_records")
          .select("*")
          .eq("workspace_id", wsId)
          .order("session_date", { ascending: false })
      ).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["students", wsId, "for-attendance"],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await sb
          .from("students")
          .select("id,name,class_name,is_active")
          .eq("workspace_id", wsId)
          .eq("is_active", true)
          .order("name")
      ).data ?? [],
  });

  const filtered = useMemo(
    () =>
      (rows ?? []).filter((r: any) => !q || r.student_name.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  );

  const save = useMutation({
    mutationFn: async () => {
      const wd = new Date(f.session_date + "T00:00:00").getDay();
      const p: any = {
        workspace_id: wsId,
        session_date: f.session_date,
        weekday: wd,
        session_time: f.session_time || null,
        student_name: f.student_name,
        class_name: f.class_name || null,
        record_type: f.record_type || "class",
        status: f.status,
        confirmed_at: f.status === "present" ? new Date().toISOString() : null,
        comments: f.comments || null,
      };
      const { error } = editId
        ? await sb.from("attendance_records").update(p).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("attendance_records").insert(p);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      setOpen(false);
      setEditId(null);
      setF(empty);
      toast.success("Salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("attendance_records")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
  const confirm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("attendance_records")
        .update({ status: "present", confirmed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
  function edit(r: any) {
    setEditId(r.id);
    setF({
      session_date: r.session_date,
      session_time: r.session_time ?? "",
      student_name: r.student_name,
      class_name: r.class_name ?? "",
      record_type: r.record_type ?? "class",
      status: r.status,
      comments: r.comments ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Lista de Presença"
        description="Confirmação de presença por aula"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setF(empty);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Novo
          </Button>
        }
      />
      <Input
        placeholder="Buscar aluno"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xs mb-3"
      />
      {filtered.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Sem registros" />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Data</th>
                  <th className="p-3">Dia</th>
                  <th className="p-3">Horário</th>
                  <th className="p-3">Aluno</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Confirmação</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3 font-mono">{r.session_date}</td>
                    <td className="p-3">{r.weekday != null ? weekdays[r.weekday] : "—"}</td>
                    <td className="p-3">{r.session_time ?? "—"}</td>
                    <td className="p-3">{r.student_name}</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${r.status === "present" ? "bg-income/10 text-income" : r.status === "absent" ? "bg-destructive/10 text-destructive" : "bg-muted"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {r.confirmed_at ? new Date(r.confirmed_at).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="p-3 flex gap-1 justify-end">
                      {r.status !== "present" && (
                        <Button variant="ghost" size="icon" onClick={() => confirm.mutate(r.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => edit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)}>
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
            <DialogTitle>{editId ? "Editar" : "Novo registro"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={f.session_date}
                onChange={(e) => setF({ ...f, session_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <Input
                placeholder="ex: 14h"
                value={f.session_time}
                onChange={(e) => setF({ ...f, session_time: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Aluno</Label>
              <Input
                list="attendance-student-suggestions"
                value={f.student_name}
                onChange={(e) => setF({ ...f, student_name: e.target.value })}
              />
              <datalist id="attendance-student-suggestions">
                {(students ?? []).map((s: any) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Turma</Label>
              <Input
                value={f.class_name}
                onChange={(e) => setF({ ...f, class_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de registro</Label>
              <Select
                value={f.record_type}
                onValueChange={(v) => setF({ ...f, record_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">Aula</SelectItem>
                  <SelectItem value="makeup">Reposição</SelectItem>
                  <SelectItem value="trial">Experimental</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Presente</SelectItem>
                  <SelectItem value="absent">Faltou</SelectItem>
                  <SelectItem value="justified">Justificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Comentários</Label>
              <Input
                value={f.comments}
                onChange={(e) => setF({ ...f, comments: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !f.student_name}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
