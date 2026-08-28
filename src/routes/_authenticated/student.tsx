import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Clock3, CheckCircle2, CalendarDays, RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, pieceStatus, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/student")({ component: Dashboard });
const sb = supabase as any;
function Dashboard() {
  const { data: access } = useStudentPortalAccess();
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-home", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const [pieces, attendance, payments] = await Promise.all([
        sb.rpc("student_portal_pieces", {
          _student_id: access!.is_preview ? access!.student_id : null,
        }),
        sb
          .from("attendance_records")
          .select("id,session_date,status,generates_makeup,makeup_completed")
          .eq("workspace_id", access!.workspace_id)
          .eq("student_id", access!.student_id)
          .order("session_date", { ascending: false }),
        sb
          .from("student_payments")
          .select("id,reference_month,status,payment_date")
          .eq("workspace_id", access!.workspace_id)
          .eq("student_id", access!.student_id)
          .order("reference_month", { ascending: false }),
      ]);
      if (pieces.error) throw pieces.error;
      const pieceRows = pieces.data ?? [];
      const photoPaths = pieceRows.map((piece: any) => piece.photo_path).filter(Boolean);
      let piecesWithPhotos = pieceRows;
      if (photoPaths.length) {
        const signed = await supabase.storage
          .from("class-material-photos")
          .createSignedUrls(photoPaths, 3600);
        if (!signed.error) {
          const urls = new Map((signed.data ?? []).map((photo: any) => [photo.path, photo.signedUrl]));
          piecesWithPhotos = pieceRows.map((piece: any) => ({
            ...piece,
            photo_url: piece.photo_path ? urls.get(piece.photo_path) : undefined,
          }));
        }
      }
      return {
        pieces: piecesWithPhotos,
        attendance: attendance.error ? [] : attendance.data ?? [],
        payments: payments.error ? [] : payments.data ?? [],
      };
    },
  });
  const pieces = data?.pieces ?? [];
  const inProgress = pieces.filter(
    (p: any) =>
      !["completed", "pronta_para_retirada", "delivered", "retirada"].includes(p.production_status),
  ).length;
  const ready = pieces.filter((p: any) =>
    ["completed", "pronta_para_retirada"].includes(p.production_status),
  ).length;
  const today = new Date().toISOString().slice(0, 10);
  const nextClass = [...(data?.attendance ?? [])]
    .filter((a: any) => a.session_date >= today)
    .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date))[0];
  const makeups = (data?.attendance ?? []).filter(
    (a: any) => a.generates_makeup && !a.makeup_completed,
  ).length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const payment = (data?.payments ?? []).find((p: any) =>
    String(p.reference_month || "").startsWith(currentMonth),
  );
  const stats = [
    [Package, "Total de peças", pieces.length],
    [Clock3, "Em andamento", inProgress],
    [CheckCircle2, "Prontas", ready],
    [CalendarDays, "Próxima aula", nextClass ? date(nextClass.session_date) : "Sem previsão"],
    [RefreshCw, "Reposições pendentes", makeups],
    [WalletCards, "Mensalidade", payment?.status === "paid" ? "Em dia" : "Pendente"],
  ] as const;
  return (
    <PortalPage title="Início" description="Acompanhe sua jornada no Selá Cerâmica.">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Não foi possível carregar os dados do aluno.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {stats.map(([Icon, label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <Icon className="h-5 w-5 text-primary" />
                  <div className="mt-3 text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 font-display text-xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <section className="mt-7">
            <h2 className="mb-3 font-display text-lg font-semibold">Últimas peças</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pieces.slice(0, 6).map((p: any) => (
                <Card key={p.id} className="overflow-hidden">
                  {p.photo_url && (
                    <img
                      src={p.photo_url}
                      alt={p.piece_name || "Peça"}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <CardContent className="p-4">
                    <div className="font-medium">{p.piece_name || "Peça sem nome"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{date(p.usage_date)}</div>
                    <Badge variant="secondary" className="mt-3">
                      {pieceStatus[p.production_status] || p.production_status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              {!pieces.length && (
                <p className="text-sm text-muted-foreground">Nenhuma peça registrada ainda.</p>
              )}
            </div>
          </section>
        </>
      )}
    </PortalPage>
  );
}
