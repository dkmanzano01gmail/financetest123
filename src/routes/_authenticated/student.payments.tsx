import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, brl, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export const Route = createFileRoute("/_authenticated/student/payments")({ component: Payments });
const sb = supabase as any;
function Payments() {
  const { data: access } = useStudentPortalAccess();
  const { data: rows = [] } = useQuery({
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
      return [...(payments.data ?? []), ...materialPayments].sort((a: any, b: any) =>
        String(b.payment_date || b.reference_month || "").localeCompare(
          String(a.payment_date || a.reference_month || ""),
        ),
      );
    },
  });
  return (
    <PortalPage
      title="Pagamentos"
      description="Consulta das mensalidades e pagamentos registrados."
    >
      <div className="space-y-3">
        {rows.map((p: any) => (
          <Card key={p.id}>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-primary">
                  {p.payment_type === "materials" ? "Materiais" : "Mensalidade"}
                </div>
                <div className="font-medium">
                  {p.description ||
                    (p.reference_month
                      ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
                          new Date(`${p.reference_month.slice(0, 10)}T12:00:00`),
                        )
                      : "Pagamento")}
                </div>
                {p.due_date && (
                  <div className="text-xs text-muted-foreground">
                    Vencimento: {date(p.due_date)}
                  </div>
                )}
              </div>
              <div className="sm:text-right">
                <div className="font-mono font-semibold">
                  {brl(Number(p.amount), access?.currency)}
                </div>
                <div className="text-xs text-muted-foreground">Pago em {date(p.payment_date)}</div>
              </div>
              <Badge className="w-fit" variant={p.status === "paid" ? "default" : "secondary"}>
                {p.status === "paid"
                  ? "Pago"
                  : p.status === "overdue"
                    ? "Atrasado"
                    : p.status === "waived"
                      ? "Isento"
                      : "Pendente"}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {!rows.length && (
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
        )}
      </div>
    </PortalPage>
  );
}
