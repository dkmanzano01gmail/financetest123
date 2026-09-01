import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { countPendingMakeups } from "@/lib/student-attendance";
export const Route = createFileRoute("/_authenticated/student/classes")({ component: Classes });
const sb = supabase as any;
function Classes() {
  const { data: access } = useStudentPortalAccess();
  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["student-classes", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const r = await sb.rpc("student_portal_attendance", {
        _student_id: access!.is_preview ? access!.student_id : null,
      });
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const present = rows.filter((r: any) => r.status === "present").length,
    absent = rows.filter((r: any) => r.status === "absent").length,
    makeups = countPendingMakeups(rows);
  const future = rows.filter(
    (r: any) => r.session_date >= new Date().toISOString().slice(0, 10),
  ).length;
  return (
    <PortalPage title="Minhas aulas">
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Aulas previstas", future],
          ["Presenças", present],
          ["Faltas", absent],
          ["Reposições pendentes", makeups],
        ].map(([l, v]) => (
          <Card key={l}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 font-display text-2xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <h2 className="mb-3 font-display text-lg font-semibold">Histórico</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando aulas…</p>}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível carregar o histórico de aulas. Atualize a página e tente novamente.
        </p>
      )}
      <div className="space-y-2">
        {rows.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium">
                  {date(r.session_date)}
                  {r.session_time ? ` · ${r.session_time}` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.record_type === "makeup"
                    ? r.makeup_completed
                      ? "Reposição realizada"
                      : "Reposição"
                    : r.generates_makeup
                      ? "Aula regular · gera reposição"
                      : "Aula regular"}
                </div>
              </div>
              <Badge variant={r.status === "present" ? "default" : "secondary"}>
                {r.status === "present"
                  ? "Presença"
                  : r.status === "absent"
                    ? "Falta"
                    : "Justificada"}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !error && !rows.length && (
          <p className="text-sm text-muted-foreground">Nenhuma aula registrada.</p>
        )}
      </div>
    </PortalPage>
  );
}
