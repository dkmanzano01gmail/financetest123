import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Package,
  Clock3,
  CheckCircle2,
  CalendarDays,
  RefreshCw,
  WalletCards,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, PiecePhoto, pieceStatus, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { countPendingMakeups } from "@/lib/student-attendance";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/student/")({ component: Dashboard });
const sb = supabase as any;

function Dashboard() {
  const { data: access } = useStudentPortalAccess();
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-home", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const [pieces, attendance, payments, student] = await Promise.all([
        sb.rpc("student_portal_pieces", {
          _student_id: access!.is_preview ? access!.student_id : null,
        }),
        sb.rpc("student_portal_attendance", {
          _student_id: access!.is_preview ? access!.student_id : null,
        }),
        sb
          .from("student_payments")
          .select("id,reference_month,status,payment_date")
          .eq("workspace_id", access!.workspace_id)
          .eq("student_id", access!.student_id)
          .order("reference_month", { ascending: false }),
        sb.from("students").select("name,class_name").eq("id", access!.student_id).single(),
      ]);
      if (pieces.error) throw pieces.error;
      const pieceRows = pieces.data ?? [];
      const photoPaths = pieceRows.map((piece: any) => piece.photo_path).filter(Boolean);
      let piecesWithPhotos = pieceRows;
      if (photoPaths.length) {
        const signed = await supabase.storage
          .from("class-piece-photos")
          .createSignedUrls(photoPaths, 3600);
        if (!signed.error) {
          const urls = new Map(
            (signed.data ?? []).map((photo: any) => [photo.path, photo.signedUrl]),
          );
          piecesWithPhotos = pieceRows.map((piece: any) => ({
            ...piece,
            photo_url: piece.photo_path ? urls.get(piece.photo_path) : undefined,
          }));
        }
      }
      return {
        studentName: student.data?.name || access!.student_name || "Aluno",
        className: student.data?.class_name || "",
        pieces: piecesWithPhotos,
        attendance: attendance.error ? [] : (attendance.data ?? []),
        payments: payments.error ? [] : (payments.data ?? []),
      };
    },
  });
  const pieces = data?.pieces ?? [];
  const inProgressPieces = pieces.filter(
    (p: any) =>
      !["completed", "pronta_para_retirada", "delivered", "retirada"].includes(p.production_status),
  );
  const ready = pieces.filter((p: any) =>
    ["completed", "pronta_para_retirada"].includes(p.production_status),
  ).length;
  const today = new Date().toISOString().slice(0, 10);
  const registeredNextClass = [...(data?.attendance ?? [])]
    .filter((a: any) => a.session_date >= today)
    .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date))[0];
  const nextClass = registeredNextClass || nextClassFromGroup(data?.className);
  const attendance = data?.attendance ?? [];
  const presences = attendance.filter((row: any) => row.status === "present").length;
  const absences = attendance.filter((row: any) => row.status === "absent").length;
  const makeups = countPendingMakeups(attendance);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const payment = (data?.payments ?? []).find((p: any) =>
    String(p.reference_month || "").startsWith(currentMonth),
  );
  const highlights = [
    {
      icon: CalendarDays,
      label: "Próxima aula",
      value: nextClass
        ? `${date(nextClass.session_date)}${nextClass.session_time ? ` · ${nextClass.session_time}` : ""}`
        : "Sem previsão",
      detail: data?.className || "Consulte seu calendário",
      to: "/student/classes" as const,
    },
    {
      icon: CheckCircle2,
      label: "Prontas para retirar",
      value: ready,
      detail: ready === 1 ? "1 peça aguardando você" : `${ready} peças aguardando você`,
      to: "/student/pieces" as const,
    },
    {
      icon: WalletCards,
      label: "Mensalidade do mês",
      value: payment?.status === "paid" ? "Em dia" : "Pendente",
      detail: "Consulte pagamentos e materiais",
      to: "/student/payments" as const,
    },
  ];
  const stats = [
    {
      icon: Package,
      label: "Total de peças",
      value: pieces.length,
      to: "/student/pieces" as const,
    },
    {
      icon: Clock3,
      label: "Em andamento",
      value: inProgressPieces.length,
      to: "/student/pieces" as const,
    },
    { icon: CheckCircle2, label: "Presenças", value: presences, to: "/student/classes" as const },
    { icon: XCircle, label: "Faltas", value: absences, to: "/student/classes" as const },
    {
      icon: RefreshCw,
      label: "Reposições pendentes",
      value: makeups,
      to: "/student/classes" as const,
    },
  ];
  return (
    <PortalPage
      title={data?.studentName ? `Olá, ${data.studentName}` : "Início"}
      description="Acompanhe sua jornada no Selá Cerâmica."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Não foi possível carregar os dados do aluno.</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">O que você precisa saber</h2>
            <div className="grid gap-3 lg:grid-cols-3">
              {highlights.map(({ icon: Icon, label, value, detail, to }) => (
                <Link key={label} to={to} className="group rounded-xl focus:outline-none">
                  <Card className="h-full transition group-hover:border-primary/50 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary">
                    <CardContent className="flex h-full items-start justify-between gap-4 p-5">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          <Icon className="h-5 w-5" />
                          {label}
                        </div>
                        <div className="mt-3 font-display text-xl font-semibold">{value}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-3">
              <h2 className="font-display text-lg font-semibold">Seu resumo</h2>
              <p className="text-xs text-muted-foreground">
                Selecione um indicador para abrir os detalhes.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {stats.map(({ icon: Icon, label, value, to }) => (
                <Link key={label} to={to} className="group rounded-xl focus:outline-none">
                  <Card className="h-full transition group-hover:border-primary/50 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary">
                    <CardContent className="flex h-full items-center justify-between gap-3 p-4">
                      <div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
                      </div>
                      <Icon className="h-5 w-5 text-primary" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Peças em andamento</h2>
              <Link
                to="/student/pieces"
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver todas
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {inProgressPieces.slice(0, 4).map((p: any) => (
                <Link
                  key={p.id}
                  to="/student/pieces"
                  className="group rounded-xl focus:outline-none"
                >
                  <Card className="h-full overflow-hidden transition group-hover:border-primary/50 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-primary">
                    <PiecePhoto
                      src={p.photo_url}
                      alt={p.piece_name || "Peça"}
                      className="aspect-[4/3] w-full"
                    />
                    <CardContent className="p-4">
                      <div className="font-medium">{p.piece_name || "Peça sem nome"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{date(p.usage_date)}</div>
                      <Badge variant="secondary" className="mt-3">
                        {pieceStatus[p.production_status] || p.production_status}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              {!inProgressPieces.length && (
                <p className="text-sm text-muted-foreground">Nenhuma peça em andamento.</p>
              )}
            </div>
          </section>
        </>
      )}
    </PortalPage>
  );
}

function nextClassFromGroup(className?: string) {
  const normalized = String(className || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const weekdays: Array<[string, number]> = [
    ["domingo", 0],
    ["segunda", 1],
    ["terca", 2],
    ["quarta", 3],
    ["quinta", 4],
    ["sexta", 5],
    ["sabado", 6],
  ];
  const weekday = weekdays.find(([label]) => normalized.includes(label))?.[1];
  if (weekday == null) return null;
  const time = normalized.match(/(?:^|\s)(\d{1,2})(?:[:h](\d{2}))?h?(?:\s|$)/);
  const hour = Math.min(23, Number(time?.[1] || 0));
  const minute = Math.min(59, Number(time?.[2] || 0));
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  let days = (weekday - now.getDay() + 7) % 7;
  if (days === 0 && next.getTime() <= now.getTime()) days = 7;
  next.setDate(now.getDate() + days);
  const sessionDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return {
    session_date: sessionDate,
    session_time: time ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : "",
  };
}
