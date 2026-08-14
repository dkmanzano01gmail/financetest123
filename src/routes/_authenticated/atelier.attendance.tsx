import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  CalendarCheck,
  Check,
  FilterX,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/attendance")({ component: Page });

const sb = supabase as any;
const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

type Student = {
  id: string;
  name: string;
  class_name: string | null;
  is_active: boolean;
};

type AttendanceRecord = {
  id: string;
  workspace_id: string;
  session_date: string;
  weekday: number | null;
  session_time: string | null;
  student_name: string;
  class_name: string | null;
  record_type: string | null;
  status: string;
  generates_makeup: boolean | null;
  makeup_completed: boolean | null;
  makeup_reference: string | null;
  confirmed_at: string | null;
  comments: string | null;
};

type AttendanceForm = {
  session_date: string;
  weekday: number;
  session_time: string;
  student_name: string;
  class_name: string;
  record_type: "class" | "makeup";
  status: "present" | "absent";
  generates_makeup: boolean;
  makeup_completed: boolean;
  makeup_reference: string;
  comments: string;
};

type QuickRow = {
  key: string;
  studentName: string;
  className: string;
  include: boolean;
  date: string;
  status: "present" | "absent";
  generatesMakeup: boolean;
  comments: string;
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayFromDate(value: string) {
  const day = new Date(`${value || localDateKey()}T12:00:00`).getDay();
  return Number.isFinite(day) ? day : 1;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function weekdayFromClassName(value: string | null | undefined) {
  const text = normalize(value);
  if (!text) return null;
  const patterns: Array<[number, string[]]> = [
    [0, ["domingo", "dom"]],
    [1, ["segunda-feira", "segunda", "seg"]],
    [2, ["terca-feira", "terca", "ter"]],
    [3, ["quarta-feira", "quarta", "qua"]],
    [4, ["quinta-feira", "quinta", "qui"]],
    [5, ["sexta-feira", "sexta", "sex"]],
    [6, ["sabado", "sab"]],
  ];
  return patterns.find(([, tokens]) => tokens.some((token) => text.includes(token)))?.[0] ?? null;
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function createEmptyForm(): AttendanceForm {
  const date = localDateKey();
  return {
    session_date: date,
    weekday: weekdayFromDate(date),
    session_time: "",
    student_name: "",
    class_name: "",
    record_type: "class",
    status: "present",
    generates_makeup: false,
    makeup_completed: false,
    makeup_reference: "",
    comments: "",
  };
}

function attendanceKey(
  studentName: string,
  date: string,
  className: string | null | undefined,
  recordType: string | null | undefined,
) {
  return [
    normalize(studentName),
    date,
    normalize(className),
    normalize(recordType || "class"),
  ].join("__");
}

function monthBounds(month: number, year: number) {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [studentFilter, setStudentFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AttendanceForm>(createEmptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState(localDateKey);
  const [quickDay, setQuickDay] = useState(() => weekdayFromDate(localDateKey()));
  const [quickGroup, setQuickGroup] = useState("all");
  const [quickRows, setQuickRows] = useState<QuickRow[]>([]);

  const {
    data: rows = [],
    error: attendanceError,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", wsId, month, year],
    enabled: !!wsId,
    queryFn: async () => {
      const { start, end } = monthBounds(month, year);
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
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const {
    data: students = [],
    error: studentsError,
    isLoading: studentsLoading,
  } = useQuery<Student[]>({
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
    retry: 1,
  });

  useEffect(() => {
    if (!wsId) return;
    const channel = sb
      .channel(`attendance-records-${wsId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `workspace_id=eq.${wsId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["attendance", wsId] }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [qc, wsId]);

  const filtered = useMemo(
    () => rows.filter((row) => studentFilter === "all" || row.student_name === studentFilter),
    [rows, studentFilter],
  );

  const allSummaries = useMemo(
    () =>
      attendanceSummary(
        rows,
        students.map((student) => student.name),
      ),
    [rows, students],
  );

  const summaries = useMemo(
    () =>
      studentFilter === "all"
        ? allSummaries
        : allSummaries.filter((item) => item.studentName === studentFilter),
    [allSummaries, studentFilter],
  );

  const summaryByStudent = useMemo(
    () => new Map(allSummaries.map((summary) => [summary.studentName, summary])),
    [allSummaries],
  );

  const totals = useMemo(
    () =>
      summaries.reduce(
        (acc, item) => ({
          records: acc.records + item.records,
          present: acc.present + item.present,
          absent: acc.absent + item.absent,
          pendingMakeups: acc.pendingMakeups + item.pendingMakeups,
          usedMakeups: acc.usedMakeups + item.usedMakeups,
        }),
        { records: 0, present: 0, absent: 0, pendingMakeups: 0, usedMakeups: 0 },
      ),
    [summaries],
  );

  const groups = useMemo(
    () =>
      [...new Set(students.map((student) => student.class_name).filter(Boolean) as string[])].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [students],
  );

  const quickGroups = useMemo(
    () =>
      groups.filter((group) => {
        const groupDay = weekdayFromClassName(group);
        return groupDay === quickDay;
      }),
    [groups, quickDay],
  );

  const quickStudents = useMemo(
    () =>
      students.filter((student) => {
        if (weekdayFromClassName(student.class_name) !== quickDay) return false;
        return quickGroup === "all" || normalize(student.class_name) === normalize(quickGroup);
      }),
    [quickDay, quickGroup, students],
  );

  const studentsWithoutRecognizedDay = useMemo(
    () =>
      students.filter(
        (student) => student.class_name && weekdayFromClassName(student.class_name) == null,
      ).length,
    [students],
  );

  useEffect(() => {
    setQuickRows(
      quickStudents.map((student) => {
        const existing = rows.find(
          (row) =>
            row.session_date === quickDate &&
            row.student_name === student.name &&
            normalize(row.class_name) === normalize(student.class_name) &&
            normalize(row.record_type || "class") === "class",
        );
        return {
          key: student.id,
          studentName: student.name,
          className: student.class_name ?? "",
          include: true,
          date: quickDate,
          status: existing?.status === "absent" ? "absent" : "present",
          generatesMakeup: !!existing?.generates_makeup,
          comments: existing?.comments ?? "",
        };
      }),
    );
  }, [quickDate, quickStudents, rows]);

  useEffect(() => {
    if (quickGroup !== "all" && !quickGroups.includes(quickGroup)) setQuickGroup("all");
  }, [quickGroup, quickGroups]);

  const save = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Workspace não encontrado.");
      if (!form.student_name.trim()) throw new Error("Informe o aluno.");
      if (!form.session_date) throw new Error("Informe a data.");

      const willUseMakeup =
        form.record_type === "makeup" && (form.makeup_completed || form.status === "present");
      if (willUseMakeup) {
        const otherRows = rows.filter(
          (row) => row.id !== editId && row.student_name === form.student_name,
        );
        const used = attendanceSummary(otherRows, [form.student_name])[0]?.usedMakeups ?? 0;
        if (used >= 2) {
          throw new Error("Esta aluna já utilizou as 2 reposições disponíveis neste mês.");
        }
      }

      const selectedStudent = students.find((student) => student.name === form.student_name);
      const payload = {
        workspace_id: wsId,
        session_date: form.session_date,
        weekday: form.weekday,
        session_time: form.session_time || null,
        student_name: form.student_name.trim(),
        class_name: form.class_name || selectedStudent?.class_name || null,
        record_type: form.record_type,
        status: form.status,
        generates_makeup:
          form.record_type === "class" && form.status === "absent" ? form.generates_makeup : false,
        makeup_completed: form.record_type === "makeup" ? form.makeup_completed : false,
        makeup_reference:
          form.record_type === "makeup" && form.makeup_reference ? form.makeup_reference : null,
        confirmed_at: form.status === "present" ? new Date().toISOString() : null,
        comments: form.comments || null,
      };
      const { error } = editId
        ? await sb
            .from("attendance_records")
            .update(payload)
            .eq("id", editId)
            .eq("workspace_id", wsId)
        : await sb.from("attendance_records").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", wsId] });
      setOpen(false);
      setEditId(null);
      setForm(createEmptyForm());
      toast.success(editId ? "Registro atualizado" : "Presença registrada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const batchSave = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Workspace não encontrado.");
      const selected = quickRows.filter((row) => row.include && row.studentName);
      if (!selected.length) throw new Error("Selecione pelo menos uma aluna.");

      const names = [...new Set(selected.map((row) => row.studentName))];
      const dates = [...new Set(selected.map((row) => row.date))];
      const { data: existingRows, error: existingError } = await sb
        .from("attendance_records")
        .select("id,session_date,student_name,class_name,record_type")
        .eq("workspace_id", wsId)
        .in("student_name", names)
        .in("session_date", dates);
      if (existingError) throw existingError;

      const existingByKey = new Map<string, string>(
        (existingRows ?? []).map((row: any): [string, string] => [
          attendanceKey(
            row.student_name,
            row.session_date,
            row.class_name,
            row.record_type || "class",
          ),
          String(row.id),
        ]),
      );

      const inserts: any[] = [];
      const updates: Array<{ id: string; payload: any }> = [];
      const confirmedAt = new Date().toISOString();

      selected.forEach((row) => {
        const payload = {
          workspace_id: wsId,
          session_date: row.date,
          weekday: weekdayFromDate(row.date),
          session_time: null,
          student_name: row.studentName,
          class_name: row.className || null,
          record_type: "class",
          status: row.status,
          generates_makeup: row.status === "absent" && row.generatesMakeup,
          makeup_completed: false,
          makeup_reference: null,
          confirmed_at: row.status === "present" ? confirmedAt : null,
          comments: row.comments.trim() || null,
        };
        const existingId = existingByKey.get(
          attendanceKey(row.studentName, row.date, row.className, "class"),
        );
        if (existingId) updates.push({ id: existingId, payload });
        else inserts.push(payload);
      });

      const updateResults = await Promise.all(
        updates.map(({ id, payload }) =>
          sb.from("attendance_records").update(payload).eq("id", id).eq("workspace_id", wsId),
        ),
      );
      const failedUpdate = updateResults.find((result) => result.error);
      if (failedUpdate?.error) throw failedUpdate.error;

      if (inserts.length) {
        const { error } = await sb.from("attendance_records").insert(inserts);
        if (error) throw error;
      }

      return { inserted: inserts.length, updated: updates.length };
    },
    onSuccess: ({ inserted, updated }) => {
      qc.invalidateQueries({ queryKey: ["attendance", wsId] });
      const parts = [
        inserted ? `${inserted} novo(s)` : "",
        updated ? `${updated} atualizado(s)` : "",
      ].filter(Boolean);
      toast.success(`${inserted + updated} confirmação(ões) salvas: ${parts.join(" e ")}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("attendance_records")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", wsId] });
      setDeleteId(null);
      toast.success("Registro removido");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openNew() {
    setEditId(null);
    setForm(createEmptyForm());
    setOpen(true);
  }

  function edit(row: AttendanceRecord) {
    setEditId(row.id);
    setForm({
      session_date: row.session_date,
      weekday: row.weekday ?? weekdayFromDate(row.session_date),
      session_time: row.session_time ?? "",
      student_name: row.student_name,
      class_name: row.class_name ?? "",
      record_type: row.record_type === "makeup" ? "makeup" : "class",
      status: row.status === "absent" ? "absent" : "present",
      generates_makeup: !!row.generates_makeup,
      makeup_completed: !!row.makeup_completed,
      makeup_reference: row.makeup_reference ?? "",
      comments: row.comments ?? "",
    });
    setOpen(true);
  }

  function updateQuickRow(key: string, patch: Partial<QuickRow>) {
    setQuickRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function updateQuickDate(value: string) {
    setQuickDate(value);
    setQuickDay(weekdayFromDate(value));
    setQuickRows((current) => current.map((row) => ({ ...row, date: value })));
  }

  function markAll(status: "present" | "absent") {
    setQuickRows((current) =>
      current.map((row) => ({
        ...row,
        include: true,
        status,
        generatesMakeup: status === "absent",
      })),
    );
  }

  const activeQuickCount = quickRows.filter((row) => row.include).length;
  const pageError = attendanceError || studentsError;

  return (
    <PageContainer>
      <PageHeader
        title="Lista de presença"
        helpKey="atelier.attendance"
        description="Confirme turmas inteiras, registre faltas e acompanhe até 2 reposições por aluno a cada mês."
        action={
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            Registro individual
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Período da lista</h2>
              <p className="text-sm text-muted-foreground">
                Escolha o mês e, se quiser, filtre por um aluno específico.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => (
                  <SelectItem key={index + 1} value={String(index + 1)}>
                    {monthLabel(index + 1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, index) => today.getFullYear() - 2 + index).map(
                  (item) => (
                    <SelectItem key={item} value={String(item)}>
                      {item}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Select value={studentFilter} onValueChange={setStudentFilter}>
              <SelectTrigger className="min-w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os alunos</SelectItem>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.name}>
                    {student.name}
                    {student.class_name ? ` — ${student.class_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {studentFilter !== "all" && (
              <Button variant="ghost" onClick={() => setStudentFilter("all")}>
                <FilterX className="mr-1 h-4 w-4" />
                Limpar aluno
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {isFetching ? "Atualizando lista…" : "Lista atualizada."}
          </p>
        </CardContent>
      </Card>

      {pageError && (
        <Card className="mb-4 border-destructive/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-destructive">Não foi possível carregar a lista.</p>
              <p className="text-sm text-muted-foreground">
                {(pageError as Error).message || "Tente novamente."}
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Registros no mês" value={totals.records} icon={CalendarCheck} />
        <SummaryCard label="Presenças" value={totals.present} tone="income" icon={UserCheck} />
        <SummaryCard label="Ausências" value={totals.absent} tone="expense" icon={UserX} />
        <SummaryCard
          label="Reposições pendentes"
          value={totals.pendingMakeups}
          note={`${totals.usedMakeups} usada(s) no mês`}
          tone={totals.pendingMakeups ? "expense" : undefined}
          icon={RotateCcw}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="relative overflow-hidden border-primary/25">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary/35" />
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <CardTitle className="text-lg">Confirmar turma do dia</CardTitle>
                    <Badge variant="secondary">Modo rápido</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Selecione o dia e confirme todos de uma vez. A data pode ser ajustada por aluno.
                  </p>
                </div>
                <Badge variant="outline">{activeQuickCount} selecionado(s)</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Data padrão</Label>
                  <Input
                    type="date"
                    value={quickDate}
                    onChange={(event) => updateQuickDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dia da semana</Label>
                  <Select
                    value={String(quickDay)}
                    onValueChange={(value) => setQuickDay(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Turma</Label>
                  <Select value={quickGroup} onValueChange={setQuickGroup}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as turmas do dia</SelectItem>
                      {quickGroups.map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="my-3 rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                {quickRows.length ? (
                  <>
                    Encontramos <strong className="text-foreground">{quickRows.length}</strong>{" "}
                    aluno(s) para <strong className="text-foreground">{WEEKDAYS[quickDay]}</strong>.
                    Confirme presença ou ausência e salve tudo uma única vez.
                  </>
                ) : (
                  <>
                    Nenhum aluno encontrado para{" "}
                    <strong className="text-foreground">{WEEKDAYS[quickDay]}</strong>. Confira se a
                    turma contém o dia, como <strong>Segunda 19h</strong> ou{" "}
                    <strong>Quarta 14h</strong>.
                  </>
                )}
                {studentsWithoutRecognizedDay > 0 && (
                  <span className="mt-1 block text-xs">
                    {studentsWithoutRecognizedDay} aluno(s) estão em turmas sem um dia reconhecível.
                  </span>
                )}
              </div>

              {quickRows.length > 0 && (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => markAll("present")}>
                      <UserCheck className="mr-1 h-4 w-4 text-income" />
                      Todos presentes
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => markAll("absent")}>
                      <UserX className="mr-1 h-4 w-4 text-expense" />
                      Todos ausentes
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setQuickRows((current) =>
                          current.map((row) => ({ ...row, include: !activeQuickCount })),
                        )
                      }
                    >
                      {activeQuickCount ? "Desmarcar todos" : "Selecionar todos"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {quickRows.map((row) => (
                      <div
                        key={row.key}
                        className={`rounded-xl border p-3 transition ${
                          row.include ? "bg-card" : "bg-muted/25 opacity-65"
                        }`}
                      >
                        <div className="grid items-center gap-3 lg:grid-cols-[28px_minmax(140px,1fr)_150px_200px_155px]">
                          <div className="flex items-center gap-2 lg:block">
                            <Checkbox
                              checked={row.include}
                              onCheckedChange={(value) =>
                                updateQuickRow(row.key, { include: value === true })
                              }
                              aria-label={`Confirmar ${row.studentName}`}
                            />
                            <span className="text-xs text-muted-foreground lg:hidden">
                              confirmar
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold">{row.studentName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.className || "Sem turma"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs lg:sr-only">Data que veio</Label>
                            <Input
                              type="date"
                              value={row.date}
                              disabled={!row.include}
                              onChange={(event) =>
                                updateQuickRow(row.key, { date: event.target.value })
                              }
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={row.status === "present" ? "default" : "ghost"}
                              disabled={!row.include}
                              onClick={() =>
                                updateQuickRow(row.key, {
                                  status: "present",
                                  generatesMakeup: false,
                                })
                              }
                            >
                              Presente
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={row.status === "absent" ? "destructive" : "ghost"}
                              disabled={!row.include}
                              onClick={() =>
                                updateQuickRow(row.key, {
                                  status: "absent",
                                  generatesMakeup: true,
                                })
                              }
                            >
                              Ausente
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={row.generatesMakeup}
                              disabled={!row.include || row.status !== "absent"}
                              onCheckedChange={(value) =>
                                updateQuickRow(row.key, { generatesMakeup: value })
                              }
                            />
                            <Label className="text-xs">Gera reposição</Label>
                          </div>
                          <div className="space-y-1.5 lg:col-span-4 lg:col-start-2">
                            <Label className="text-xs text-muted-foreground">Observação</Label>
                            <Input
                              className="w-full"
                              value={row.comments}
                              disabled={!row.include}
                              placeholder="Inclua uma observação sobre esta aula, se necessário"
                              onChange={(event) =>
                                updateQuickRow(row.key, { comments: event.target.value })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="mt-4"
                    onClick={() => batchSave.mutate()}
                    disabled={!activeQuickCount || batchSave.isPending}
                  >
                    {batchSave.isPending
                      ? "Salvando confirmações…"
                      : `Salvar ${activeQuickCount} confirmação(ões)`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Registros do mês</CardTitle>
              <p className="text-sm text-muted-foreground">
                Presenças, ausências e reposições do período selecionado.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading || studentsLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Carregando registros…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={CalendarCheck}
                    title="Sem registros neste período"
                    description="Use a confirmação rápida acima ou crie um registro individual."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="p-3">Data</th>
                        <th className="p-3">Aluno / turma</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3">Presença</th>
                        <th className="p-3">Reposição</th>
                        <th className="p-3">Uso no mês</th>
                        <th className="p-3">Observações</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => {
                        const studentSummary = summaryByStudent.get(row.student_name);
                        const isMakeup = normalize(row.record_type).includes("makeup");
                        const isAbsent = row.status === "absent";
                        return (
                          <tr key={row.id} className="border-t align-top hover:bg-muted/20">
                            <td className="p-3">
                              <p className="font-medium">{formatDate(row.session_date)}</p>
                              <p className="text-xs text-muted-foreground">
                                {WEEKDAYS[row.weekday ?? weekdayFromDate(row.session_date)]} ·
                                semana {Math.ceil(Number(row.session_date.slice(8, 10)) / 7)}
                              </p>
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{row.student_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.class_name || "Sem turma"}
                              </p>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline">{isMakeup ? "Reposição" : "Aula"}</Badge>
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={isAbsent ? "destructive" : "secondary"}
                                className={
                                  isAbsent ? "" : "bg-income/10 text-income hover:bg-income/15"
                                }
                              >
                                {isAbsent ? "Ausente" : "Presente"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs leading-5">
                              {row.generates_makeup && <div>Gera reposição</div>}
                              {row.makeup_completed && <div>Reposição realizada</div>}
                              {row.makeup_reference && (
                                <div className="text-muted-foreground">
                                  Ref.: {row.makeup_reference}
                                </div>
                              )}
                              {!row.generates_makeup &&
                                !row.makeup_completed &&
                                !row.makeup_reference &&
                                "—"}
                            </td>
                            <td className="p-3">
                              <p className="font-medium">
                                {studentSummary?.usedMakeups ?? 0}/2 usadas
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {studentSummary?.availableMakeups ?? 2} disponíveis
                              </p>
                            </td>
                            <td className="max-w-56 whitespace-normal p-3 text-muted-foreground">
                              {row.comments || "—"}
                            </td>
                            <td className="p-3">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => edit(row)}
                                  aria-label="Editar registro"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteId(row.id)}
                                  aria-label="Remover registro"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle className="text-lg">Resumo de reposições</CardTitle>
            <p className="text-sm text-muted-foreground">
              Clique no nome para filtrar os registros do aluno.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!summaries.length ? (
              <EmptyState icon={Users} title="Nenhum aluno encontrado" />
            ) : (
              summaries.map((item) => (
                <button
                  type="button"
                  key={item.studentName}
                  className="w-full rounded-xl border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/20"
                  onClick={() => setStudentFilter(item.studentName)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.studentName}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.className || "Sem turma"}
                      </p>
                    </div>
                    {studentFilter === item.studentName && (
                      <Badge variant="secondary">Filtrado</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-muted/45 p-2">
                      <strong className="block text-base">{item.records}</strong>
                      registros
                    </div>
                    <div className="rounded-lg bg-muted/45 p-2">
                      <strong className="block text-base">{item.absent}</strong>
                      ausências
                    </div>
                    <div className="rounded-lg bg-muted/45 p-2">
                      <strong className="block text-base">{item.usedMakeups}/2</strong>
                      usadas
                    </div>
                    <div
                      className={`rounded-lg p-2 ${
                        item.pendingMakeups
                          ? "bg-destructive/10 text-destructive"
                          : "bg-income/10 text-income"
                      }`}
                    >
                      <strong className="block text-base">{item.pendingMakeups}</strong>
                      pendentes
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Reposições disponíveis no mês:{" "}
                    <strong className="text-foreground">{item.availableMakeups}</strong>
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setEditId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar registro" : "Registrar presença semanal"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Para uma falta, marque se ela gera reposição. Quando o aluno vier repor, escolha o tipo
            Reposição.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Aluno</Label>
              <Select
                value={form.student_name || "none"}
                onValueChange={(value) => {
                  const student = students.find((item) => item.name === value);
                  setForm({
                    ...form,
                    student_name: value === "none" ? "" : value,
                    class_name: student?.class_name ?? form.class_name,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione um aluno</SelectItem>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.name}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={form.session_date}
                onChange={(event) =>
                  setForm({
                    ...form,
                    session_date: event.target.value,
                    weekday: weekdayFromDate(event.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dia da semana</Label>
              <Select
                value={String(form.weekday)}
                onValueChange={(value) => setForm({ ...form, weekday: Number(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day, index) => (
                    <SelectItem key={day} value={String(index)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Turma</Label>
              <Select
                value={form.class_name || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, class_name: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem turma</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Horário (opcional)</Label>
              <Input
                value={form.session_time}
                placeholder="Ex.: 19h"
                onChange={(event) => setForm({ ...form, session_time: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>É aula ou reposição?</Label>
              <Select
                value={form.record_type}
                onValueChange={(value: "class" | "makeup") =>
                  setForm({
                    ...form,
                    record_type: value,
                    generates_makeup: value === "class" && form.status === "absent",
                    makeup_completed: value === "makeup" && form.status === "present",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">Aula</SelectItem>
                  <SelectItem value="makeup">Reposição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Presença</Label>
              <Select
                value={form.status}
                onValueChange={(value: "present" | "absent") =>
                  setForm({
                    ...form,
                    status: value,
                    generates_makeup: form.record_type === "class" && value === "absent",
                    makeup_completed: form.record_type === "makeup" && value === "present",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Presente</SelectItem>
                  <SelectItem value="absent">Ausente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.record_type === "class" && form.status === "absent" && (
              <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                <Switch
                  checked={form.generates_makeup}
                  onCheckedChange={(value) => setForm({ ...form, generates_makeup: value })}
                />
                <Label>Esta ausência gera reposição</Label>
              </div>
            )}
            {form.record_type === "makeup" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                  <Switch
                    checked={form.makeup_completed}
                    onCheckedChange={(value) => setForm({ ...form, makeup_completed: value })}
                  />
                  <Label>Reposição realizada</Label>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Reposição referente a</Label>
                  <Input
                    value={form.makeup_reference}
                    placeholder="Ex.: ausência do dia 12/06"
                    onChange={(event) => setForm({ ...form, makeup_reference: event.target.value })}
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.comments}
                placeholder="Ex.: avisou com antecedência, reagendou, chegou atrasado…"
                onChange={(event) => setForm({ ...form, comments: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : editId ? "Salvar alterações" : "Salvar presença"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(value) => !value && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Os totais de presença e reposição do mês serão recalculados automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "income" | "expense";
  icon: typeof CalendarCheck;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div
          className={`mt-1 font-mono text-2xl ${
            tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""
          }`}
        >
          {value}
        </div>
        {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
