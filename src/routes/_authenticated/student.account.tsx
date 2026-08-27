import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
export const Route = createFileRoute("/_authenticated/student/account")({ component: Account });
const sb = supabase as any;
function Account() {
  const { data: access } = useStudentPortalAccess();
  const { data: student } = useQuery({
    queryKey: ["student-profile", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const r = await sb
        .from("students")
        .select("name,email,class_name,phone,instagram,enrollment_date,photo_url")
        .eq("workspace_id", access!.workspace_id)
        .eq("id", access!.student_id)
        .single();
      if (r.error) throw r.error;
      return r.data;
    },
  });
  return (
    <PortalPage title="Minha conta">
      <Card>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row">
          {student?.photo_url && (
            <img
              src={student.photo_url}
              alt={student.name}
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Nome</div>
              <div className="font-medium">{student?.name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">E-mail</div>
              <div>{student?.email || access?.invited_email || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Turma</div>
              <div>{student?.class_name || "—"}</div>
            </div>
            {student?.phone && (
              <div>
                <div className="text-xs text-muted-foreground">Telefone</div>
                <div>{student.phone}</div>
              </div>
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Para alterar seus dados, fale com a equipe do Selá Cerâmica.
            </p>
          </div>
        </CardContent>
      </Card>
    </PortalPage>
  );
}
