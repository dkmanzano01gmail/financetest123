import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage, date } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export const Route = createFileRoute("/_authenticated/student/classes")({ component: Classes });
const sb = supabase as any;
function Classes() {
  const { data: access } = useStudentPortalAccess();
  const { data: rows = [] } = useQuery({
    queryKey: ["student-classes", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const r = await sb
        .from("attendance_records")
        .select("*")
        .eq("workspace_id", access!.workspace_id)
        .eq("student_id", access!.student_id)
        .order("session_date", { ascending: false });
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const present = rows.filter((r: any) => r.status === "present").length,
    absent = rows.filter((r: any) => r.status === "absent").length,
    makeups = rows.filter((r: any) => r.generates_makeup && !r.makeup_completed).length;
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
                  {r.record_type === "makeup" ? "Reposição" : "Aula regular"}
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
        {!rows.length && <p className="text-sm text-muted-foreground">Nenhuma aula registrada.</p>}
      </div>
    </PortalPage>
  );
}
