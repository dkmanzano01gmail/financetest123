import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency, monthLabel, parseLocaleAmount } from "@/lib/format";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Instagram,
  PackageCheck,
  PackageOpen,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  WalletCards,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/students")({ component: Page });

const sb = supabase as any;
const NOW = new Date();
const CLASS_SUMMARY_TARGET_USER_ID = "0fc9511c-da1f-4fde-aba5-4a5397ad0bca";
const CLASS_SUMMARY_WORKSPACE_ID = "37f30192-2237-4949-986b-8ad5d6434f91";
const emptyStudent = () => ({
  name: "",
  class_name: "",
  monthly_fee: "0",
  enrollment_date: new Date().toISOString().slice(0, 10),
  phone: "",
  instagram: "",
  social_link: "",
  photo_url: "",
  is_active: true,
  notes: "",
});
const emptyPayment = () => ({
  payment_date: new Date().toISOString().slice(0, 10),
  amount: "",
  payment_type: "tuition",
  reference_month: new Date().toISOString().slice(0, 7),
  payment_method: "",
  notes: "",
});

function Page() {
  const { user } = useAuth();
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [periodMode, setPeriodMode] = useState<"month" | "lifetime">("month");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyStudent());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPayment());

  const { data: students = [], isLoading, error } = useQuery({
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
  const { data: attendance = [] } = useQuery({
    queryKey: ["attendance_records", wsId, "students-summary"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("attendance_records")
        .select("id,student_name,session_date,status,record_type")
        .eq("workspace_id", wsId)
        .order("session_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: pieces = [] } = useQuery({
    queryKey: ["class_materials_usage", wsId, "students-summary"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("class_materials_usage")
        .select("id,student_id,student_name,usage_date,piece_name,quantity,production_status,completed_at,amount_charged,amount_paid,payment_status,payment_date")
        .eq("workspace_id", wsId)
        .order("usage_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["student_payments", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("student_payments")
        .select("*")
        .eq("workspace_id", wsId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const classOptions = useMemo(() => {
    const uniqueClasses = new Map<string, string>();
    for (const student of students as Array<{
      class_name?: string | null;
      is_active?: boolean;
    }>) {
      const className = String(student.class_name || "").trim();
      if (className) uniqueClasses.set(className.toLocaleLowerCase("pt-BR"), className);
    }
    return [...uniqueClasses.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [students]);

  const classSummary = useMemo(() => {
    const counts = new Map<string, { name: string; total: number; active: number }>();
    for (const student of students as any[]) {
      const className = String(student.class_name || "").trim() || "Sem turma";
      const key = className.toLocaleLowerCase("pt-BR");
      const current = counts.get(key) ?? { name: className, total: 0, active: 0 };
      current.total += 1;
      if (student.is_active) current.active += 1;
      counts.set(key, current);
    }
    return [...counts.values()].sort((a, b) => {
      if (a.name === "Sem turma") return 1;
      if (b.name === "Sem turma") return -1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [students]);

  const showClassSummary =
    user?.id === CLASS_SUMMARY_TARGET_USER_ID && wsId === CLASS_SUMMARY_WORKSPACE_ID;

  const inSelectedMonth = (value?: string | null) => {
    if (!value) return false;
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  };
  const studentPieces = (student: any) =>
    (pieces as any[]).filter(
      (piece) =>
        piece.student_id === student.id ||
        (!piece.student_id &&
          String(piece.student_name).trim().toLocaleLowerCase("pt-BR") ===
            String(student.name).trim().toLocaleLowerCase("pt-BR")),
    );
  const metricsFor = (student: any, mode: "month" | "lifetime") => {
    const attendances = (attendance as any[]).filter(
      (item) =>
        String(item.student_name).trim().toLocaleLowerCase("pt-BR") ===
          String(student.name).trim().toLocaleLowerCase("pt-BR") &&
        (mode === "lifetime" || inSelectedMonth(item.session_date)),
    );
    const materialRows = studentPieces(student).filter(
      (item) => mode === "lifetime" || inSelectedMonth(item.usage_date),
    );
    const paymentRows = (payments as any[]).filter(
      (item) =>
        item.student_id === student.id &&
        (mode === "lifetime" || inSelectedMonth(item.payment_date)),
    );
    const completed = materialRows.filter((item) =>
      ["completed", "delivered"].includes(item.production_status),
    );
    const materialPaid = materialRows.reduce((total, item) => {
      const charged = Number(item.amount_charged || 0);
      const paid = Number(
        item.amount_paid ?? (item.payment_status === "paid" ? charged : 0),
      );
      return total + (paid || (item.payment_status === "paid" ? charged : 0));
    }, 0);
    return {
      present: attendances.filter((item) => item.status === "present").length,
      absent: attendances.filter((item) => item.status === "absent").length,
      paymentsCount: paymentRows.length,
      paymentsTotal: paymentRows.reduce((total, item) => total + Number(item.amount || 0), 0),
      completed: completed.reduce((total, item) => total + Number(item.quantity || 1), 0),
      inProgress: materialRows
        .filter((item) => !["completed", "delivered"].includes(item.production_status))
        .reduce((total, item) => total + Number(item.quantity || 1), 0),
      materialPaid,
    };
  };

  const studentRows = useMemo(
    () =>
      (students as any[])
        .filter(
          (student) =>
            (statusFilter === "all" ||
              (statusFilter === "active" ? student.is_active : !student.is_active)) &&
            (!q ||
              student.name.toLocaleLowerCase("pt-BR").includes(q.toLocaleLowerCase("pt-BR")) ||
              String(student.class_name || "")
                .toLocaleLowerCase("pt-BR")
                .includes(q.toLocaleLowerCase("pt-BR"))),
        )
        .map((student) => ({
          student,
          metrics: metricsFor(student, periodMode),
        })),
    [students, attendance, pieces, payments, periodMode, month, year, q, statusFilter],
  );

  const selected = (students as any[]).find((student) => student.id === selectedId);
  const selectedLifetime = selected ? metricsFor(selected, "lifetime") : null;
  const selectedMonth = selected ? metricsFor(selected, "month") : null;
  const selectedPayments = (payments as any[])
    .filter((payment) => payment.student_id === selectedId)
    .slice(0, 8);
  const summary = studentRows.reduce(
    (total, item) => ({
      present: total.present + item.metrics.present,
      absent: total.absent + item.metrics.absent,
      completed: total.completed + item.metrics.completed,
      inProgress: total.inProgress + item.metrics.inProgress,
      materialPaid: total.materialPaid + item.metrics.materialPaid,
      paymentsTotal: total.paymentsTotal + item.metrics.paymentsTotal,
    }),
    { present: 0, absent: 0, completed: 0, inProgress: 0, materialPaid: 0, paymentsTotal: 0 },
  );

  const saveStudent = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Workspace não encontrado.");
      if (!form.name.trim()) throw new Error("Informe o nome do aluno.");
      const fee = form.monthly_fee.trim() ? parseLocaleAmount(form.monthly_fee) : 0;
      if (!Number.isFinite(fee)) throw new Error("Mensalidade inválida.");
      let photoUrl = form.photo_url || null;
      if (photoFile) {
        if (!wsId) throw new Error("Workspace não encontrado.");
        const extension = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${wsId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("student-photos")
          .upload(path, photoFile, { upsert: false, contentType: photoFile.type });
        if (uploadError) throw uploadError;
        photoUrl = supabase.storage.from("student-photos").getPublicUrl(path).data.publicUrl;
      }
      const studentData = {
        name: form.name.trim(),
        class_name: form.class_name.trim() || null,
        monthly_fee: fee,
        enrollment_date: form.enrollment_date || null,
        phone: form.phone.trim() || null,
        instagram: form.instagram.trim().replace(/^@/, "") || null,
        social_link: form.social_link.trim() || null,
        photo_url: photoUrl,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      };
      if (editId) {
        const { data, error } = await sb
          .from("students")
          .update(studentData)
          .eq("id", editId)
          .eq("workspace_id", wsId)
          .select("id,class_name")
          .single();
        if (error) throw error;
        if (!data?.id || data.class_name !== studentData.class_name) {
          throw new Error("A turma não foi atualizada. Recarregue a página e tente novamente.");
        }
      } else {
        const { error } = await sb.from("students").insert({
          workspace_id: wsId,
          ...studentData,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      setEditId(null);
      setForm(emptyStudent());
      setPhotoFile(null);
      toast.success("Perfil do aluno salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePayment = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Selecione um aluno.");
      const amount = parseLocaleAmount(paymentForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor válido.");
      const { error } = await sb.from("student_payments").insert({
        workspace_id: wsId,
        student_id: selectedId,
        payment_date: paymentForm.payment_date,
        amount,
        payment_type: paymentForm.payment_type,
        reference_month:
          paymentForm.payment_type === "tuition" && paymentForm.reference_month
            ? `${paymentForm.reference_month}-01`
            : null,
        payment_method: paymentForm.payment_method.trim() || null,
        notes: paymentForm.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student_payments"] });
      setPaymentOpen(false);
      setPaymentForm(emptyPayment());
      toast.success("Pagamento registrado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function editStudent(student: any) {
    setEditId(student.id);
    setPhotoFile(null);
    setForm({
      name: student.name,
      class_name: student.class_name ?? "",
      monthly_fee: String(student.monthly_fee ?? 0),
      enrollment_date: student.enrollment_date ?? student.created_at?.slice(0, 10) ?? "",
      phone: student.phone ?? "",
      instagram: student.instagram ?? "",
      social_link: student.social_link ?? "",
      photo_url: student.photo_url ?? "",
      is_active: !!student.is_active,
      notes: student.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Alunos"
        helpKey="atelier.students"
        description="Perfil completo, frequência, pagamentos e produção de cada aluno"
        action={
          <Button
            onClick={() => {
              setEditId(null);
              setPhotoFile(null);
              setForm(emptyStudent());
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />Novo aluno
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <Field label="Período">
            <Select value={periodMode} onValueChange={(value: "month" | "lifetime") => setPeriodMode(value)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mês específico</SelectItem>
                <SelectItem value="lifetime">Desde o início</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mês">
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))} disabled={periodMode === "lifetime"}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => (
                  <SelectItem key={index + 1} value={String(index + 1)}>{monthLabel(index + 1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ano">
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))} disabled={periodMode === "lifetime"}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, index) => NOW.getFullYear() - 4 + index).map((value) => (
                  <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Buscar">
            <Input className="w-56" placeholder="Nome ou turma" value={q} onChange={(event) => setQ(event.target.value)} />
          </Field>
          <Field label="Cadastro">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Ativos</SelectItem><SelectItem value="inactive">Inativos</SelectItem><SelectItem value="all">Todos</SelectItem></SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard icon={CheckCircle2} label="Presenças" value={String(summary.present)} tone="income" />
        <SummaryCard icon={XCircle} label="Faltas" value={String(summary.absent)} tone="expense" />
        <SummaryCard icon={PackageCheck} label="Peças concluídas" value={String(summary.completed)} />
        <SummaryCard icon={PackageOpen} label="Em produção" value={String(summary.inProgress)} />
        <SummaryCard icon={WalletCards} label="Pagamentos" value={formatCurrency(summary.paymentsTotal, currency, privacy)} tone="income" />
        <SummaryCard icon={ReceiptText} label="Materiais pagos" value={formatCurrency(summary.materialPaid, currency, privacy)} />
      </div>

      {showClassSummary && classSummary.length > 0 && (
        <section className="mb-4" aria-labelledby="class-summary-title">
          <div className="mb-2 flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            <h2 id="class-summary-title" className="font-medium">
              Alunos por turma
            </h2>
            <Badge variant="secondary">{students.length} alunos</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {classSummary.map((item) => (
              <Card key={item.name}>
                <CardContent className="p-4">
                  <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                    {item.name}
                  </div>
                  <div className="mt-1 font-mono text-2xl">{item.total}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.active} {item.active === 1 ? "ativo" : "ativos"}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive">Erro ao carregar: {(error as Error).message}</div>
      ) : studentRows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Sem alunos neste filtro" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {studentRows.map(({ student, metrics }) => (
            <Card key={student.id} className="transition hover:border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-14 w-14 border">
                    <AvatarImage src={student.photo_url || undefined} alt={student.name} className="object-cover" />
                    <AvatarFallback className="text-base font-semibold">{initials(student.name)}</AvatarFallback>
                  </Avatar>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(student.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{student.name}</span>
                      {!student.is_active && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">{student.class_name || "Turma não informada"}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>Desde {formatDate(student.enrollment_date || student.created_at)}</span>
                      {student.phone && <span>{student.phone}</span>}
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => editStudent(student)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <button className="mt-4 grid w-full grid-cols-3 gap-2 text-left sm:grid-cols-6" onClick={() => setSelectedId(student.id)}>
                  <Mini label="Presenças" value={metrics.present} tone="income" />
                  <Mini label="Faltas" value={metrics.absent} tone="expense" />
                  <Mini label="Concluídas" value={metrics.completed} />
                  <Mini label="Em produção" value={metrics.inProgress} />
                  <Mini label="Pagamentos" value={formatCurrency(metrics.paymentsTotal, currency, privacy)} />
                  <Mini label="Materiais" value={formatCurrency(metrics.materialPaid, currency, privacy)} />
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar perfil do aluno" : "Novo aluno"}</DialogTitle></DialogHeader>
          <div className="flex items-center gap-4 rounded-lg border p-3">
            <Avatar className="h-20 w-20 border">
              <AvatarImage src={photoFile ? URL.createObjectURL(photoFile) : form.photo_url || undefined} className="object-cover" />
              <AvatarFallback><Camera className="h-6 w-6" /></AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <Label htmlFor="student-photo" className="cursor-pointer">
                <span className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium shadow-sm">Escolher foto</span>
              </Label>
              <Input id="student-photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} />
              <div className="text-xs text-muted-foreground">JPG, PNG, WebP ou HEIC, até 5 MB.</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Turma">
              <Select
                value={form.class_name || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, class_name: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem turma</SelectItem>
                  {classOptions.map((className) => (
                    <SelectItem key={className} value={className}>
                      {className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data de início"><Input type="date" value={form.enrollment_date} onChange={(event) => setForm({ ...form, enrollment_date: event.target.value })} /></Field>
            <Field label="Mensalidade"><Input inputMode="decimal" value={form.monthly_fee} onChange={(event) => setForm({ ...form, monthly_fee: event.target.value })} /></Field>
            <Field label="Celular"><Input type="tel" placeholder="(11) 99999-9999" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="Instagram"><Input placeholder="@usuario" value={form.instagram} onChange={(event) => setForm({ ...form, instagram: event.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Outra rede social / site"><Input type="url" placeholder="https://..." value={form.social_link} onChange={(event) => setForm({ ...form, social_link: event.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="Notas"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></div>
            <div className="flex items-center gap-3 sm:col-span-2"><Switch checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} /><Label>Aluno ativo</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => saveStudent.mutate()} disabled={saveStudent.isPending || !form.name.trim()}>Salvar perfil</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(value) => !value && setSelectedId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          {selected && selectedLifetime && selectedMonth && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-14 w-14 border"><AvatarImage src={selected.photo_url || undefined} className="object-cover" /><AvatarFallback>{initials(selected.name)}</AvatarFallback></Avatar>
                  <span><span className="block">{selected.name}</span><span className="block text-sm font-normal text-muted-foreground">{selected.class_name || "Sem turma"} · desde {formatDate(selected.enrollment_date || selected.created_at)}</span></span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-wrap gap-2 text-sm">
                {selected.phone && <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted" href={`tel:${selected.phone}`}><Phone className="h-3.5 w-3.5" />{selected.phone}</a>}
                {selected.instagram && <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted" href={`https://instagram.com/${selected.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer"><Instagram className="h-3.5 w-3.5" />@{selected.instagram.replace(/^@/, "")}</a>}
                {selected.social_link && <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted" href={selected.social_link} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Rede social</a>}
              </div>
              <PeriodMetrics title="Desde o início" metrics={selectedLifetime} currency={currency} privacy={privacy} />
              <PeriodMetrics title={`${monthLabel(month)} de ${year}`} metrics={selectedMonth} currency={currency} privacy={privacy} />
              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b p-3">
                  <div><div className="font-medium">Pagamentos registrados</div><div className="text-xs text-muted-foreground">Mensalidades e outros pagamentos do aluno. Materiais são calculados automaticamente pelas peças.</div></div>
                  <Button size="sm" onClick={() => { setPaymentForm(emptyPayment()); setPaymentOpen(true); }}><Plus className="mr-1 h-4 w-4" />Registrar</Button>
                </div>
                {selectedPayments.length === 0 ? (
                  <div className="p-5 text-sm text-muted-foreground">Nenhum pagamento de mensalidade/outros registrado.</div>
                ) : (
                  <div className="divide-y">
                    {selectedPayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div><div className="font-medium">{paymentTypeLabel(payment.payment_type)}</div><div className="text-xs text-muted-foreground">{formatDate(payment.payment_date)}{payment.payment_method ? ` · ${payment.payment_method}` : ""}</div></div>
                        <div className="font-mono text-income">{formatCurrency(Number(payment.amount || 0), currency, privacy)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => editStudent(selected)}><Pencil className="mr-1 h-4 w-4" />Editar perfil</Button><Button onClick={() => setSelectedId(null)}>Fechar</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar pagamento · {selected?.name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input type="date" value={paymentForm.payment_date} onChange={(event) => setPaymentForm({ ...paymentForm, payment_date: event.target.value })} /></Field>
            <Field label="Valor"><Input inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} /></Field>
            <Field label="Tipo"><Select value={paymentForm.payment_type} onValueChange={(value) => setPaymentForm({ ...paymentForm, payment_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tuition">Mensalidade</SelectItem><SelectItem value="material">Material avulso</SelectItem><SelectItem value="other">Outro</SelectItem></SelectContent></Select></Field>
            <Field label="Mês de referência"><Input type="month" disabled={paymentForm.payment_type !== "tuition"} value={paymentForm.reference_month} onChange={(event) => setPaymentForm({ ...paymentForm, reference_month: event.target.value })} /></Field>
            <Field label="Forma de pagamento"><Input placeholder="Pix, cartão..." value={paymentForm.payment_method} onChange={(event) => setPaymentForm({ ...paymentForm, payment_method: event.target.value })} /></Field>
            <Field label="Notas"><Input value={paymentForm.notes} onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button><Button onClick={() => savePayment.mutate()} disabled={savePayment.isPending}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PeriodMetrics({ title, metrics, currency, privacy }: { title: string; metrics: any; currency: string; privacy: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 font-medium"><CalendarDays className="h-4 w-4" />{title}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Mini label="Presenças" value={metrics.present} tone="income" />
        <Mini label="Faltas" value={metrics.absent} tone="expense" />
        <Mini label="Pagamentos" value={`${metrics.paymentsCount} · ${formatCurrency(metrics.paymentsTotal, currency, privacy)}`} />
        <Mini label="Concluídas" value={metrics.completed} />
        <Mini label="Em produção" value={metrics.inProgress} />
        <Mini label="Materiais pagos" value={formatCurrency(metrics.materialPaid, currency, privacy)} />
      </div>
    </div>
  );
}
function SummaryCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: "income" | "expense" }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><div className={`mt-1 font-mono text-xl ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div></CardContent></Card>;
}
function Mini({ label, value, tone }: { label: string; value: ReactNode; tone?: "income" | "expense" }) {
  return <div className="rounded-md bg-muted/45 p-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className={`mt-0.5 truncate font-mono text-sm font-medium ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
function formatDate(value?: string | null) {
  if (!value) return "não informada";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}
function paymentTypeLabel(value: string) {
  return value === "tuition" ? "Mensalidade" : value === "material" ? "Material avulso" : "Outro";
}
