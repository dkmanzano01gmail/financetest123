import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleDollarSign,
  ClipboardCopy,
  Loader2,
  PackageCheck,
  Pencil,
  QrCode,
  RotateCcw,
  SearchCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createPixPayload } from "@/lib/pix-br";
import { parseLocaleAmount } from "@/lib/format";
import {
  allocateMaterialPayment,
  findPaymentSuggestion,
  getMaterialReferencePeriod,
  normalizePaymentText,
  type PaymentSuggestion,
  type PaymentSuggestionKind,
} from "@/lib/student-payment-control";

export const Route = createFileRoute("/_authenticated/atelier/student-payments")({
  component: Page,
});

// The generated client types lag behind the portal/payment migrations already used in production.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TODAY = new Date();
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type StudentRow = {
  id: string;
  name: string;
  class_name?: string | null;
  monthly_fee?: number | null;
};
type MaterialRow = {
  id: string;
  student_id?: string | null;
  student_name?: string | null;
  amount_charged?: number | null;
  amount_paid?: number | null;
  amount_pending?: number | null;
  payment_status?: string | null;
  payment_date?: string | null;
};
type PaymentRow = {
  id: string;
  student_id: string;
  amount?: number | null;
  payment_type?: string | null;
  reference_month?: string | null;
  payment_date?: string | null;
  status?: string | null;
};
type TransactionRow = {
  id: string;
  amount: number;
  date?: string | null;
  description?: string | null;
  counterparty?: string | null;
  method?: string | null;
};
type StudentSummary = {
  student: StudentRow;
  tuitionAmount: number;
  tuitionPaid: number;
  tuitionDue: number;
  materials: MaterialRow[];
  materialsAmount: number;
  materialsPaid: number;
  materialsDue: number;
  suggestion: PaymentSuggestion | null;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function monthBounds(year: number, month: number) {
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    next: month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`,
  };
}

function numeric(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function Page() {
  const { workspace } = useCurrentWorkspace();
  const wsId = workspace?.id;
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(TODAY.getMonth() + 1);
  const [year, setYear] = useState(TODAY.getFullYear());
  const [search, setSearch] = useState("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pixStudent, setPixStudent] = useState<StudentSummary | null>(null);
  const [pixTuition, setPixTuition] = useState("");
  const [pixMaterials, setPixMaterials] = useState("");
  const [editTarget, setEditTarget] = useState<{
    summary: StudentSummary;
    kind: "tuition" | "materials";
  } | null>(null);
  const [editPaidValue, setEditPaidValue] = useState("");
  const { start: monthStart } = monthBounds(year, month);
  const { year: materialReferenceYear, month: materialReferenceMonth } = getMaterialReferencePeriod(
    year,
    month,
  );
  const { start: materialStart, next: nextMaterialStart } = monthBounds(
    materialReferenceYear,
    materialReferenceMonth,
  );
  const materialReferenceLabel = `${MONTHS[materialReferenceMonth - 1]} de ${materialReferenceYear}`;

  const studentsQuery = useQuery({
    queryKey: ["students", wsId, "payment-control"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("students")
        .select("id,name,class_name,monthly_fee")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["student_payments", wsId, "payment-control"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("student_payments")
        .select("id,student_id,amount,payment_type,reference_month,payment_date,status")
        .eq("workspace_id", wsId);
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });
  const materialsQuery = useQuery({
    queryKey: [
      "class_materials_usage",
      wsId,
      "payment-control",
      materialReferenceYear,
      materialReferenceMonth,
    ],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("class_materials_usage")
        .select(
          "id,student_id,student_name,amount_charged,amount_paid,amount_pending,payment_status,payment_date,production_status",
        )
        .eq("workspace_id", wsId)
        .in("production_status", ["completed", "delivered"])
        .gte("usage_date", materialStart)
        .lt("usage_date", nextMaterialStart);
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", wsId, "student-payment-suggestions", year, month],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("transactions")
        .select("id,amount,date,description,counterparty,method")
        .eq("workspace_id", wsId)
        .eq("type", "income")
        .eq("year", year)
        .eq("month", month)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransactionRow[];
    },
  });

  const summaries = useMemo(() => {
    const payments = paymentsQuery.data ?? [];
    const materials = materialsQuery.data ?? [];
    const transactions = transactionsQuery.data ?? [];
    return (studentsQuery.data ?? []).map((student): StudentSummary => {
      const tuitionAmount = numeric(student.monthly_fee) > 0 ? numeric(student.monthly_fee) : 600;
      const tuitionRows = payments.filter((payment) => {
        const reference = payment.reference_month || payment.payment_date || "";
        return (
          payment.student_id === student.id &&
          (payment.payment_type ?? "tuition") === "tuition" &&
          reference.slice(0, 7) === monthStart.slice(0, 7) &&
          payment.status === "paid"
        );
      });
      const tuitionPaid = tuitionRows.reduce((total, row) => total + numeric(row.amount), 0);
      const studentName = normalizePaymentText(student.name);
      const studentMaterials = materials.filter(
        (row) =>
          row.student_id === student.id ||
          (!row.student_id && normalizePaymentText(row.student_name) === studentName),
      );
      const materialsAmount = studentMaterials.reduce(
        (total, row) => total + numeric(row.amount_charged),
        0,
      );
      const materialsPaid = studentMaterials.reduce((total, row) => {
        const paid = numeric(row.amount_paid);
        return (
          total +
          (paid > 0 ? paid : row.payment_status === "paid" ? numeric(row.amount_charged) : 0)
        );
      }, 0);
      const tuitionDue = Math.max(0, tuitionAmount - tuitionPaid);
      const materialsDue = Math.max(0, materialsAmount - materialsPaid);
      return {
        student,
        tuitionAmount,
        tuitionPaid,
        tuitionDue,
        materials: studentMaterials,
        materialsAmount,
        materialsPaid,
        materialsDue,
        suggestion: findPaymentSuggestion({
          studentName: student.name,
          tuitionDue,
          materialsDue,
          transactions,
        }),
      };
    });
  }, [
    materialsQuery.data,
    monthStart,
    paymentsQuery.data,
    studentsQuery.data,
    transactionsQuery.data,
  ]);

  const filtered = useMemo(() => {
    const query = normalizePaymentText(search);
    if (!query) return summaries;
    return summaries.filter(
      ({ student }) =>
        normalizePaymentText(student.name).includes(query) ||
        normalizePaymentText(student.class_name).includes(query),
    );
  }, [search, summaries]);

  const totals = useMemo(
    () =>
      summaries.reduce(
        (result, summary) => ({
          tuitionDue: result.tuitionDue + summary.tuitionDue,
          materialsDue: result.materialsDue + summary.materialsDue,
          paid: result.paid + summary.tuitionPaid + summary.materialsPaid,
        }),
        { tuitionDue: 0, materialsDue: 0, paid: 0 },
      ),
    [summaries],
  );

  const confirmPayment = useMutation({
    mutationFn: async ({
      summary,
      kind,
      suggestion,
    }: {
      summary: StudentSummary;
      kind: PaymentSuggestionKind;
      suggestion?: PaymentSuggestion | null;
    }) => {
      if (!wsId) throw new Error("Workspace não encontrado.");
      const transaction = suggestion?.transaction;
      const paymentDate = transaction?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      const note = transaction
        ? `Transação confirmada no controle mensal: ${transaction.description || transaction.counterparty || transaction.id} (${transaction.id})`
        : "Pagamento confirmado manualmente no controle mensal.";

      if ((kind === "tuition" || kind === "combined") && summary.tuitionDue > 0) {
        const existing = (paymentsQuery.data ?? []).find((payment) => {
          const reference = payment.reference_month || payment.payment_date || "";
          return (
            payment.student_id === summary.student.id &&
            (payment.payment_type ?? "tuition") === "tuition" &&
            reference.slice(0, 7) === monthStart.slice(0, 7)
          );
        });
        const payload = {
          workspace_id: wsId,
          student_id: summary.student.id,
          payment_date: paymentDate,
          due_date: monthStart,
          amount: summary.tuitionAmount,
          payment_type: "tuition",
          reference_month: monthStart,
          payment_method: transaction?.method || "Confirmado manualmente",
          status: "paid",
          notes: note,
        };
        const result = existing
          ? await sb
              .from("student_payments")
              .update(payload)
              .eq("id", existing.id)
              .eq("workspace_id", wsId)
          : await sb.from("student_payments").insert(payload);
        if (result.error) throw result.error;
      }

      if ((kind === "materials" || kind === "combined") && summary.materialsDue > 0) {
        const pendingRows = summary.materials.filter(
          (row) =>
            row.payment_status !== "paid" || numeric(row.amount_paid) < numeric(row.amount_charged),
        );
        const results = await Promise.all(
          pendingRows.map((row) =>
            sb
              .from("class_materials_usage")
              .update({
                payment_status: "paid",
                payment_date: paymentDate,
                amount_paid: numeric(row.amount_charged),
                amount_pending: 0,
              })
              .eq("id", row.id)
              .eq("workspace_id", wsId),
          ),
        );
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student_payments"] }),
        queryClient.invalidateQueries({ queryKey: ["class_materials_usage"] }),
      ]);
      toast.success("Pagamento confirmado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editPaidAmount = useMutation({
    mutationFn: async ({
      summary,
      kind,
      amount,
    }: {
      summary: StudentSummary;
      kind: "tuition" | "materials";
      amount: number;
    }) => {
      if (!wsId) throw new Error("Workspace não encontrado.");
      const total = kind === "tuition" ? summary.tuitionAmount : summary.materialsAmount;
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Informe um valor pago válido.");
      }
      if (amount > total) {
        throw new Error(`O valor pago não pode ultrapassar ${money(total)}.`);
      }

      if (kind === "tuition") {
        const matchingRows = (paymentsQuery.data ?? []).filter((payment) => {
          const reference = payment.reference_month || payment.payment_date || "";
          return (
            payment.student_id === summary.student.id &&
            (payment.payment_type ?? "tuition") === "tuition" &&
            reference.slice(0, 7) === monthStart.slice(0, 7)
          );
        });
        const primary = matchingRows[0];
        const otherIds = matchingRows.slice(1).map((payment) => payment.id);
        if (otherIds.length > 0) {
          const { error } = await sb
            .from("student_payments")
            .update({ status: "pending" })
            .in("id", otherIds)
            .eq("workspace_id", wsId);
          if (error) throw error;
        }
        if (amount === 0) {
          if (primary) {
            const { error } = await sb
              .from("student_payments")
              .update({ status: "pending" })
              .eq("id", primary.id)
              .eq("workspace_id", wsId);
            if (error) throw error;
          }
          return;
        }
        const payload = {
          workspace_id: wsId,
          student_id: summary.student.id,
          payment_date: primary?.payment_date || new Date().toISOString().slice(0, 10),
          due_date: monthStart,
          amount,
          payment_type: "tuition",
          reference_month: monthStart,
          payment_method: "Editado no controle mensal",
          status: "paid",
          notes: "Valor pago ajustado manualmente no controle mensal.",
        };
        const result = primary
          ? await sb
              .from("student_payments")
              .update(payload)
              .eq("id", primary.id)
              .eq("workspace_id", wsId)
          : await sb.from("student_payments").insert(payload);
        if (result.error) throw result.error;
        return;
      }

      const allocation = allocateMaterialPayment(
        summary.materials.map((row) => ({ id: row.id, amount: numeric(row.amount_charged) })),
        amount,
      );
      const results = await Promise.all(
        summary.materials.map((row) => {
          const item = allocation.find((entry) => entry.id === row.id)!;
          return sb
            .from("class_materials_usage")
            .update({
              amount_paid: item.amountPaid,
              amount_pending: item.amountPending,
              payment_status: item.status,
              payment_date:
                item.amountPaid > 0
                  ? row.payment_date || new Date().toISOString().slice(0, 10)
                  : null,
            })
            .eq("id", row.id)
            .eq("workspace_id", wsId);
        }),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student_payments"] }),
        queryClient.invalidateQueries({ queryKey: ["class_materials_usage"] }),
      ]);
      setEditTarget(null);
      toast.success("Valor pago atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openPix(summary: StudentSummary) {
    setPixStudent(summary);
    setPixTuition(summary.tuitionDue.toFixed(2));
    setPixMaterials(summary.materialsDue.toFixed(2));
  }

  function openPaymentEdit(summary: StudentSummary, kind: "tuition" | "materials") {
    setEditTarget({ summary, kind });
    setEditPaidValue((kind === "tuition" ? summary.tuitionPaid : summary.materialsPaid).toFixed(2));
  }

  const loading =
    studentsQuery.isLoading ||
    paymentsQuery.isLoading ||
    materialsQuery.isLoading ||
    transactionsQuery.isLoading;
  const error =
    studentsQuery.error || paymentsQuery.error || materialsQuery.error || transactionsQuery.error;

  return (
    <PageContainer>
      <PageHeader
        title="Pagamentos de alunos"
        description={`Controle de ${MONTHS[month - 1]}: mensalidade do mês e materiais utilizados em ${materialReferenceLabel} (M+1).`}
      />
      <div className="mb-5 grid gap-3 md:grid-cols-[180px_140px_1fr]">
        <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((label, index) => (
              <SelectItem key={label} value={String(index + 1)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[year - 2, year - 1, year, year + 1]
              .filter((value, index, values) => values.indexOf(value) === index)
              .sort()
              .map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <SearchCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar aluno ou turma..."
          />
        </div>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Mensalidades pendentes"
          value={money(totals.tuitionDue)}
          icon={<CalendarDays />}
        />
        <MetricCard
          label={`Materiais pendentes · ${materialReferenceLabel}`}
          value={money(totals.materialsDue)}
          icon={<PackageCheck />}
        />
        <MetricCard label="Confirmado no mês" value={money(totals.paid)} icon={<BadgeCheck />} />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando controle...
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Não foi possível carregar o controle: {(error as Error).message}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum aluno ativo encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((summary) => {
            const suggestionKey = summary.suggestion
              ? `${summary.student.id}:${summary.suggestion.transaction.id}:${summary.suggestion.kind}`
              : "";
            const suggestion =
              suggestionKey && !dismissed.has(suggestionKey) ? summary.suggestion : null;
            return (
              <StudentPaymentCard
                key={summary.student.id}
                summary={summary}
                suggestion={suggestion}
                busy={confirmPayment.isPending}
                materialReferenceLabel={materialReferenceLabel}
                onConfirm={(kind, selectedSuggestion) =>
                  confirmPayment.mutate({ summary, kind, suggestion: selectedSuggestion })
                }
                onDismiss={() => setDismissed((current) => new Set(current).add(suggestionKey))}
                onPix={() => openPix(summary)}
                onEdit={(kind) => openPaymentEdit(summary, kind)}
              />
            );
          })}
        </div>
      )}
      <PixDialog
        summary={pixStudent}
        tuition={pixTuition}
        materials={pixMaterials}
        onTuitionChange={setPixTuition}
        onMaterialsChange={setPixMaterials}
        onClose={() => setPixStudent(null)}
      />
      <EditPaidDialog
        target={editTarget}
        value={editPaidValue}
        busy={editPaidAmount.isPending}
        materialReferenceLabel={materialReferenceLabel}
        onValueChange={setEditPaidValue}
        onClose={() => setEditTarget(null)}
        onSave={(amount) => {
          if (editTarget) editPaidAmount.mutate({ ...editTarget, amount });
        }}
      />
    </PageContainer>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-display text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentPaymentCard({
  summary,
  suggestion,
  busy,
  materialReferenceLabel,
  onConfirm,
  onDismiss,
  onPix,
  onEdit,
}: {
  summary: StudentSummary;
  suggestion: PaymentSuggestion | null;
  busy: boolean;
  materialReferenceLabel: string;
  onConfirm: (kind: PaymentSuggestionKind, suggestion?: PaymentSuggestion | null) => void;
  onDismiss: () => void;
  onPix: () => void;
  onEdit: (kind: "tuition" | "materials") => void;
}) {
  const allPaid = summary.tuitionDue === 0 && summary.materialsDue === 0;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{summary.student.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.student.class_name || "Sem turma"}
            </p>
          </div>
          <Badge
            variant={allPaid ? "secondary" : "outline"}
            className={allPaid ? "bg-emerald-100 text-emerald-800" : ""}
          >
            {allPaid ? "Tudo pago" : "Pendente"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PaymentBlock
            label="Mensalidade"
            total={summary.tuitionAmount}
            paid={summary.tuitionPaid}
            due={summary.tuitionDue}
            onConfirm={summary.tuitionDue > 0 ? () => onConfirm("tuition") : undefined}
            onEdit={() => onEdit("tuition")}
            busy={busy}
          />
          <PaymentBlock
            label="Materiais (M+1)"
            referenceLabel={materialReferenceLabel}
            total={summary.materialsAmount}
            paid={summary.materialsPaid}
            due={summary.materialsDue}
            onConfirm={summary.materialsDue > 0 ? () => onConfirm("materials") : undefined}
            onEdit={summary.materialsAmount > 0 ? () => onEdit("materials") : undefined}
            busy={busy}
          />
        </div>
        {suggestion && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="flex items-start gap-2">
              <SearchCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Possível pagamento encontrado</p>
                <p className="truncate">
                  {suggestion.transaction.description ||
                    suggestion.transaction.counterparty ||
                    "Transação sem descrição"}
                </p>
                <p className="text-xs">
                  {money(Math.abs(suggestion.transaction.amount))} ·{" "}
                  {suggestion.transaction.date
                    ? new Date(
                        `${suggestion.transaction.date.slice(0, 10)}T12:00:00`,
                      ).toLocaleDateString("pt-BR")
                    : "data não informada"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onConfirm(suggestion.kind, suggestion)}
              >
                <Check className="mr-1 h-4 w-4" />
                Confirmar{" "}
                {suggestion.kind === "combined"
                  ? "mensalidade + materiais"
                  : suggestion.kind === "tuition"
                    ? "mensalidade"
                    : "materiais"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                <X className="mr-1 h-4 w-4" />
                Não corresponde
              </Button>
            </div>
          </div>
        )}
        <Button className="w-full" variant="outline" disabled={allPaid} onClick={onPix}>
          <QrCode className="mr-2 h-4 w-4" />
          Gerar Pix do valor pendente
        </Button>
      </CardContent>
    </Card>
  );
}

function PaymentBlock({
  label,
  total,
  paid,
  due,
  onConfirm,
  onEdit,
  referenceLabel,
  busy,
}: {
  label: string;
  total: number;
  paid: number;
  due: number;
  onConfirm?: () => void;
  onEdit?: () => void;
  referenceLabel?: string;
  busy: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="font-medium">{label}</p>
      {referenceLabel && <p className="text-[11px] text-muted-foreground">Ref. {referenceLabel}</p>}
      <p className="mt-1 text-xs text-muted-foreground">Previsto: {money(total)}</p>
      <p className="text-xs text-emerald-700">Pago: {money(paid)}</p>
      <p
        className={
          due > 0 ? "mt-1 font-semibold text-destructive" : "mt-1 font-semibold text-emerald-700"
        }
      >
        {due > 0 ? `Falta ${money(due)}` : "Pago"}
      </p>
      {onConfirm && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          disabled={busy}
          onClick={onConfirm}
        >
          Confirmar pagamento
        </Button>
      )}
      {onEdit && (
        <Button size="sm" variant="ghost" className="mt-1 w-full" disabled={busy} onClick={onEdit}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Editar valor pago
        </Button>
      )}
    </div>
  );
}

function EditPaidDialog({
  target,
  value,
  busy,
  materialReferenceLabel,
  onValueChange,
  onClose,
  onSave,
}: {
  target: { summary: StudentSummary; kind: "tuition" | "materials" } | null;
  value: string;
  busy: boolean;
  materialReferenceLabel: string;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSave: (amount: number) => void;
}) {
  const parsed = parseLocaleAmount(value);
  const paid = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const total = target
    ? target.kind === "tuition"
      ? target.summary.tuitionAmount
      : target.summary.materialsAmount
    : 0;
  const title = target?.kind === "tuition" ? "mensalidade" : "materiais";

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pagamento de {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <p className="font-medium">{target?.summary.student.name}</p>
            <p className="text-muted-foreground">
              {target?.kind === "materials"
                ? `Materiais utilizados em ${materialReferenceLabel}, cobrados no mês selecionado.`
                : "Mensalidade do mês selecionado."}
            </p>
            <p className="mt-1">
              Valor total: <strong>{money(total)}</strong>
            </p>
          </div>
          <div>
            <Label htmlFor="paid-value">Valor efetivamente pago</Label>
            <Input
              id="paid-value"
              inputMode="decimal"
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder="0,00"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Para corrigir uma confirmação feita por engano, use “Desfazer pagamento”.
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="destructive" disabled={busy} onClick={() => onSave(0)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Desfazer pagamento
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={busy || !Number.isFinite(parsed) || paid > total}
              onClick={() => onSave(paid)}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar valor
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PixDialog({
  summary,
  tuition,
  materials,
  onTuitionChange,
  onMaterialsChange,
  onClose,
}: {
  summary: StudentSummary | null;
  tuition: string;
  materials: string;
  onTuitionChange: (value: string) => void;
  onMaterialsChange: (value: string) => void;
  onClose: () => void;
}) {
  const tuitionValue = Math.max(0, parseLocaleAmount(tuition) || 0);
  const materialsValue = Math.max(0, parseLocaleAmount(materials) || 0);
  const total = tuitionValue + materialsValue;
  const payload =
    summary && total > 0
      ? createPixPayload({
          amount: total,
          studentName: summary.student.name,
          description: `Mensalidade e materiais Sela - ${summary.student.name}`,
        })
      : "";
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    if (!payload) {
      setQrDataUrl("");
      return () => {
        active = false;
      };
    }
    import("qrcode")
      .then(({ toDataURL }) => toDataURL(payload, { width: 320, margin: 1 }))
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, [payload]);

  async function copy(value: string, success: string) {
    await navigator.clipboard.writeText(value);
    toast.success(success);
  }

  const message = summary
    ? `Olá, ${summary.student.name}!\n\nO valor pendente é ${money(total)} (${money(tuitionValue)} de mensalidade e ${money(materialsValue)} de materiais).\n\nPix Copia e Cola:\n${payload}`
    : "";

  return (
    <Dialog
      open={!!summary}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pix para {summary?.student.name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pix-tuition">Mensalidade</Label>
            <Input
              id="pix-tuition"
              inputMode="decimal"
              value={tuition}
              onChange={(event) => onTuitionChange(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pix-materials">Materiais</Label>
            <Input
              id="pix-materials"
              inputMode="decimal"
              value={materials}
              onChange={(event) => onMaterialsChange(event.target.value)}
            />
          </div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-xs text-muted-foreground">Total do Pix</p>
          <p className="font-display text-2xl font-semibold">{money(total)}</p>
        </div>
        {total > 0 && qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR Code Pix de ${summary?.student.name}`}
            className="mx-auto h-56 w-56 rounded-lg border bg-white p-2"
          />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Informe um valor maior que zero para gerar o Pix.
          </p>
        )}
        {payload && (
          <div className="space-y-2">
            <Label>Pix Copia e Cola</Label>
            <div className="break-all rounded-lg border bg-muted/40 p-3 font-mono text-[10px]">
              {payload}
            </div>
          </div>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={!payload}
            onClick={() => copy(payload, "Pix copiado")}
          >
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copiar Pix
          </Button>
          <Button disabled={!payload} onClick={() => copy(message, "Mensagem copiada")}>
            <CircleDollarSign className="mr-2 h-4 w-4" />
            Copiar mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
