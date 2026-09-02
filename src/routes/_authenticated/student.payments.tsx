import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, brl, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/student/payments")({ component: Payments });

const sb = supabase as any;
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

function paymentDate(payment: any) {
  return payment.reference_month || payment.payment_date || payment.created_at || "";
}

function paymentStatus(status: string) {
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "waived") return "Isento";
  return "Pendente";
}

function Payments() {
  const { data: access } = useStudentPortalAccess();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["student-payments-portal", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const [payments, pieces] = await Promise.all([
        sb
          .from("student_payments")
          .select("*")
          .eq("workspace_id", access!.workspace_id)
          .eq("student_id", access!.student_id)
          .order("reference_month", { ascending: false }),
        sb.rpc("student_portal_pieces", {
          _student_id: access!.is_preview ? access!.student_id : null,
        }),
      ]);
      if (payments.error) throw payments.error;
      if (pieces.error) throw pieces.error;
      const materialPayments = (pieces.data ?? [])
        .filter(
          (piece: any) => Number(piece.amount_paid || 0) > 0 || piece.payment_status === "paid",
        )
        .map((piece: any) => ({
          id: `material-${piece.id}`,
          payment_type: "materials",
          reference_month: piece.usage_date,
          payment_date: piece.payment_date,
          due_date: null,
          amount: Number(piece.amount_paid || piece.amount_charged || 0),
          status: "paid",
          description: piece.piece_name || "Materiais de aula",
        }));
      return [...(payments.data ?? []), ...materialPayments];
    },
  });

  const availableYears = useMemo(() => {
    const years = rows
      .map((payment: any) => Number(paymentDate(payment).slice(0, 4)))
      .filter((year: number) => Number.isFinite(year));
    return [...new Set([currentYear, ...years])].sort((a, b) => b - a);
  }, [currentYear, rows]);

  const yearRows = useMemo(
    () => rows.filter((payment: any) => Number(paymentDate(payment).slice(0, 4)) === selectedYear),
    [rows, selectedYear],
  );

  const annual = useMemo(
    () =>
      yearRows.reduce(
        (totals: { charged: number; paid: number; pending: number }, payment: any) => {
          const amount = Math.max(0, Number(payment.amount) || 0);
          if (payment.status !== "waived") totals.charged += amount;
          if (payment.status === "paid") totals.paid += amount;
          if (payment.status !== "paid" && payment.status !== "waived") totals.pending += amount;
          return totals;
        },
        { charged: 0, paid: 0, pending: 0 },
      ),
    [yearRows],
  );

  const months = useMemo(
    () =>
      MONTHS.map((name, month) => {
        const payments = yearRows
          .filter((payment: any) => Number(paymentDate(payment).slice(5, 7)) === month + 1)
          .sort((a: any, b: any) => paymentDate(b).localeCompare(paymentDate(a)));
        const charged = payments.reduce(
          (total: number, payment: any) =>
            payment.status === "waived" ? total : total + Math.max(0, Number(payment.amount) || 0),
          0,
        );
        const paid = payments.reduce(
          (total: number, payment: any) =>
            payment.status === "paid" ? total + Math.max(0, Number(payment.amount) || 0) : total,
          0,
        );
        const pending = payments.reduce(
          (total: number, payment: any) =>
            payment.status !== "paid" && payment.status !== "waived"
              ? total + Math.max(0, Number(payment.amount) || 0)
              : total,
          0,
        );
        return { name, payments, charged, paid, pending };
      }),
    [yearRows],
  );

  return (
    <PortalPage title="Pagamentos" description="Acompanhe mensalidades e materiais mês a mês.">
      <div className="mb-5 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">Extrato anual</div>
          <div className="text-sm text-muted-foreground">
            Selecione o ano e consulte todos os meses na lista abaixo.
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          Ano
          <select
            aria-label="Selecionar ano dos pagamentos"
            className="h-10 min-w-28 rounded-md border bg-background px-3"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={WalletCards}
          label="Total registrado"
          value={brl(annual.charged, access?.currency)}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Total pago"
          value={brl(annual.paid, access?.currency)}
        />
        <SummaryCard
          icon={Clock3}
          label="Em aberto"
          value={brl(annual.pending, access?.currency)}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando pagamentos…</p>}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível carregar os pagamentos. Atualize a página e tente novamente.
        </p>
      )}

      {!isLoading && !error && (
        <div className="space-y-4">
          {months.map((month) => {
            const status = !month.payments.length
              ? "Sem lançamentos"
              : month.pending > 0
                ? "Pendente"
                : "Pago";
            return (
              <Card key={month.name} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-3 border-b bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                        <CalendarDays className="size-5" />
                      </div>
                      <div>
                        <h2 className="font-semibold">
                          {month.name} de {selectedYear}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {month.payments.length
                            ? `${month.payments.length} lançamento${month.payments.length === 1 ? "" : "s"}`
                            : "Nenhum pagamento registrado"}
                        </p>
                      </div>
                    </div>
                    <Badge className="w-fit" variant={status === "Pago" ? "default" : "secondary"}>
                      {status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-px bg-border">
                    <MonthTotal label="Cobrança" value={brl(month.charged, access?.currency)} />
                    <MonthTotal label="Pago" value={brl(month.paid, access?.currency)} />
                    <MonthTotal label="Pendente" value={brl(month.pending, access?.currency)} />
                  </div>

                  {month.payments.length > 0 && (
                    <div className="divide-y">
                      {month.payments.map((payment: any) => (
                        <div
                          key={payment.id}
                          className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                        >
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-primary">
                              {payment.payment_type === "materials" ? "Materiais" : "Mensalidade"}
                            </div>
                            <div className="font-medium">
                              {payment.description ||
                                (payment.payment_type === "materials"
                                  ? "Materiais de aula"
                                  : "Mensalidade")}
                            </div>
                            {payment.due_date && (
                              <div className="text-xs text-muted-foreground">
                                Vencimento: {date(payment.due_date)}
                              </div>
                            )}
                          </div>
                          <div className="sm:text-right">
                            <div className="font-mono font-semibold">
                              {brl(Number(payment.amount), access?.currency)}
                            </div>
                            {payment.payment_date && (
                              <div className="text-xs text-muted-foreground">
                                Pago em {date(payment.payment_date)}
                              </div>
                            )}
                          </div>
                          <Badge
                            className="w-fit"
                            variant={payment.status === "paid" ? "default" : "secondary"}
                          >
                            {paymentStatus(payment.status)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PortalPage>
  );
}

function SummaryCard({ icon: Icon, label, value }: any) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
        </div>
        <Icon className="size-5 text-primary" />
      </CardContent>
    </Card>
  );
}

function MonthTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-3 sm:p-4">
      <div className="text-[11px] text-muted-foreground sm:text-xs">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold sm:text-base">{value}</div>
    </div>
  );
}
