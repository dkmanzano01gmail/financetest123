import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { attendanceSummary } from "@/lib/orna-logic";
import { monthLabel } from "@/lib/format";
import { CalendarCheck, Check, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/attendance")({ component: Page });
const sb = supabase as any;
const NOW = new Date();
const empty = () => ({
  session_date: new Date().toISOString().slice(0, 10),
  session_time: "",
  student_name: "",
  class_name: "",
  record_type: "class",
  status: "present",
  generates_makeup: false,
  makeup_completed: false,
  makeup_reference: "",
  comments: "",
});
const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [studentFilter, setStudentFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["attendance", wsId, month, year],
    enabled: !!wsId,
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0);
      const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
      const { data, error } = await sb
        .from("attendance_records")
        .select("*")
        .eq("workspace_id", wsId)
        .gte("session_date", start)
        .lte("session_date", end)
        .order("session_date", { ascending: true })
        .order("student_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students", wsId, "for-attendance"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("students")
        .select("id,name,class_name,is_active")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () => rows.filter((row: any) => studentFilter === "all" || row.student_name === studentFilter),
    [rows, studentFilter],
  );
  const summaries = useMemo(
    () => attendanceSummary(filtered, studentFilter === "all" ? students.map((student: any) => student.name) : [studentFilter]),
    [filtered, students, studentFilter],
  );
  const totals = useMemo(
    () => summaries.reduce((acc, item) => ({
      students: acc.students + 1,
      records: acc.records + item.records,
      present: acc.present + item.present,
      absent: acc.absent + item.absent,
      pendingMakeups: acc.pendingMakeups + item.pendingMakeups,
      usedMakeups: acc.usedMakeups + item.usedMakeups,
    }), { students: 0, records: 0, present: 0, absent: 0, pendingMakeups: 0, usedMakeups: 0 }),
    [summaries],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.student_name.trim()) throw new Error("Informe o aluno.");
      if (!form.session_date) throw new Error("Informe a data.");
      const weekday = new Date(`${form.session_date}T12:00:00`).getDay();
      const selectedStudent = students.find((student: any) => student.name === form.student_name);
      const payload = {
        workspace_id: wsId,
        session_date: form.session_date,
        weekday,
        session_time: form.session_time || null,
        student_name: form.student_name.trim(),
        class_name: form.class_name || selectedStudent?.class_name || null,
        record_type: form.record_type,
        status: form.status,
        generates_makeup: form.status === "absent" ? form.generates_makeup : false,
        makeup_completed: form.record_type === "makeup" ? form.makeup_completed : false,
        makeup_reference: form.makeup_reference || null,
        confirmed_at: form.status === "present" ? new Date().toISOString() : null,
        comments: form.comments || null,
      };
      const { error } = editId
        ? await sb.from("attendance_records").update(payload).eq("id", editId).eq("workspace_id", wsId)
        : await sb.from("attendance_records").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      setOpen(false);
      setEditId(null);
      setForm(empty());
      toast.success("Registro salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("attendance_records").delete().eq("id", id).eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const confirm = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await sb
        .from("attendance_records")
        .update({
          status: "present",
          makeup_completed: row.record_type === "makeup" ? true : row.makeup_completed,
          confirmed_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(row: any) {
    setEditId(row.id);
    setForm({
      session_date: row.session_date,
      session_time: row.session_time ?? "",
      student_name: row.student_name,
      class_name: row.class_name ?? "",
      record_type: row.record_type ?? "class",
      status: row.status,
      generates_makeup: !!row.generates_makeup,
      makeup_completed: !!row.makeup_completed,
      makeup_reference: row.makeup_reference ?? "",
      comments: row.comments ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Lista de Presença"
        description="Presenças, faltas e controle mensal de reposições"
        action={<Button onClick={() => { setEditId(null); setForm(empty()); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Novo registro</Button>}
      />

      <Card className="mb-4"><CardContent className="flex flex-wrap gap-2 p-3">
        <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{monthLabel(index + 1)}</SelectItem>)}</SelectContent></Select>
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent></Select>
        <Select value={studentFilter} onValueChange={setStudentFilter}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os alunos</SelectItem>{students.map((student: any) => <SelectItem key={student.id} value={student.name}>{student.name}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Alunos" value={totals.students} />
        <SummaryCard label="Registros" value={totals.records} />
        <SummaryCard label="Presentes" value={totals.present} tone="income" />
        <SummaryCard label="Faltas" value={totals.absent} tone="expense" />
        <SummaryCard label="Reposições usadas" value={totals.usedMakeups} />
        <SummaryCard label="Reposições pendentes" value={totals.pendingMakeups} tone={totals.pendingMakeups ? "expense" : undefined} />
      </div>

      <Card className="mb-4"><CardHeader><CardTitle className="text-base">Resumo por aluno</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Aluno</th><th className="p-3">Turma</th><th className="p-3">Aulas</th><th className="p-3">Presenças</th><th className="p-3">Faltas</th><th className="p-3">Reposições usadas</th><th className="p-3">Disponíveis</th><th className="p-3">Pendentes</th></tr></thead><tbody>{summaries.map((item) => <tr key={item.studentName} className="border-t"><td className="p-3 font-medium">{item.studentName}</td><td className="p-3">{item.className || "—"}</td><td className="p-3">{item.classes}</td><td className="p-3 text-income">{item.present}</td><td className="p-3 text-expense">{item.absent}</td><td className="p-3">{item.usedMakeups}</td><td className="p-3">{item.availableMakeups}</td><td className="p-3">{item.pendingMakeups}</td></tr>)}</tbody></table>
      </CardContent></Card>

      {isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div> : filtered.length === 0 ? <EmptyState icon={CalendarCheck} title="Sem registros neste período" /> : (
        <Card><CardHeader><CardTitle className="text-base">Registros do mês</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Data</th><th className="p-3">Dia</th><th className="p-3">Aluno</th><th className="p-3">Turma</th><th className="p-3">Tipo</th><th className="p-3">Status</th><th className="p-3">Gera reposição</th><th className="p-3">Reposição concluída</th><th className="p-3" /></tr></thead><tbody>{filtered.map((row: any) => <tr key={row.id} className="border-t"><td className="p-3 font-mono">{row.session_date}</td><td className="p-3">{row.weekday != null ? weekdays[row.weekday] : "—"}</td><td className="p-3 font-medium">{row.student_name}</td><td className="p-3">{row.class_name ?? "—"}</td><td className="p-3">{row.record_type === "makeup" ? "Reposição" : row.record_type === "class" ? "Aula" : row.record_type}</td><td className={`p-3 ${row.status === "present" ? "text-income" : row.status === "absent" ? "text-expense" : ""}`}>{row.status === "present" ? "Presente" : row.status === "absent" ? "Ausente" : "Justificado"}</td><td className="p-3">{row.generates_makeup ? "Sim" : "Não"}</td><td className="p-3">{row.makeup_completed ? "Sim" : "Não"}</td><td className="p-3"><div className="flex justify-end gap-1">{row.status !== "present" && <Button variant="ghost" size="icon" onClick={() => confirm.mutate(row)}><Check className="h-4 w-4" /></Button>}<Button variant="ghost" size="icon" onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editId ? "Editar registro" : "Novo registro"}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={form.session_date} onChange={(event) => setForm({ ...form, session_date: event.target.value })} /></div>
        <div className="space-y-1.5"><Label>Horário</Label><Input value={form.session_time} onChange={(event) => setForm({ ...form, session_time: event.target.value })} /></div>
        <div className="col-span-2 space-y-1.5"><Label>Aluno</Label><Select value={form.student_name || "none"} onValueChange={(value) => { const student = students.find((item: any) => item.name === value); setForm({ ...form, student_name: value === "none" ? "" : value, class_name: student?.class_name ?? form.class_name }); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{students.map((student: any) => <SelectItem key={student.id} value={student.name}>{student.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Turma</Label><Input value={form.class_name} onChange={(event) => setForm({ ...form, class_name: event.target.value })} /></div>
        <div className="space-y-1.5"><Label>Tipo</Label><Select value={form.record_type} onValueChange={(value) => setForm({ ...form, record_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="class">Aula</SelectItem><SelectItem value="makeup">Reposição</SelectItem><SelectItem value="trial">Experimental</SelectItem><SelectItem value="workshop">Workshop</SelectItem><SelectItem value="other">Outro</SelectItem></SelectContent></Select></div>
        <div className="col-span-2 space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="present">Presente</SelectItem><SelectItem value="absent">Ausente</SelectItem><SelectItem value="justified">Justificado</SelectItem></SelectContent></Select></div>
        {form.status === "absent" && <div className="col-span-2 flex items-center gap-3"><Switch checked={form.generates_makeup} onCheckedChange={(value) => setForm({ ...form, generates_makeup: value })} /><Label>Esta falta gera reposição</Label></div>}
        {form.record_type === "makeup" && <><div className="col-span-2 flex items-center gap-3"><Switch checked={form.makeup_completed} onCheckedChange={(value) => setForm({ ...form, makeup_completed: value })} /><Label>Reposição concluída</Label></div><div className="col-span-2 space-y-1.5"><Label>Referência da falta/aula</Label><Input value={form.makeup_reference} onChange={(event) => setForm({ ...form, makeup_reference: event.target.value })} /></div></>}
        <div className="col-span-2 space-y-1.5"><Label>Comentários</Label><Input value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></div>
      </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button></DialogFooter></DialogContent></Dialog>
    </PageContainer>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "income" | "expense" }) {
  return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-2xl ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div></CardContent></Card>;
}
