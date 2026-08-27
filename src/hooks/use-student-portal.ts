import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type StudentPortalAccess = {
  id: string;
  workspace_id: string;
  student_id: string;
  user_id: string;
  invited_email: string;
  status: "ativo";
  accepted_at: string;
  workspace_name: string;
  currency: string;
  is_preview?: boolean;
  student_name?: string;
};

export function useStudentPortalAccess() {
  const { user } = useAuth();
  const [previewStudentId, setPreviewStudentId] = useState<string | null>(null);
  useEffect(() => {
    const requestedPreview = new URLSearchParams(window.location.search).get("previewStudentId");
    if (requestedPreview) window.sessionStorage.setItem("student-portal-preview", requestedPreview);
    setPreviewStudentId(
      requestedPreview || window.sessionStorage.getItem("student-portal-preview"),
    );
  }, []);
  return useQuery({
    queryKey: ["student-portal-access", user?.id, previewStudentId],
    enabled: !!user,
    queryFn: async () => {
      if (previewStudentId) {
        const { data: student, error: studentError } = await supabase
          .from("students")
          .select("id,workspace_id,name")
          .eq("id", previewStudentId)
          .single();
        if (studentError) throw studentError;

        const { data: role, error: roleError } = await supabase.rpc("workspace_role_of", {
          _workspace_id: student.workspace_id,
          _user_id: user!.id,
        });
        if (roleError) throw roleError;
        if (role !== "owner" && role !== "member")
          throw new Error("Acesso administrativo necessário");

        const { data: workspace, error: workspaceError } = await supabase
          .from("workspaces")
          .select("name,currency")
          .eq("id", student.workspace_id)
          .single();
        if (workspaceError) throw workspaceError;

        return {
          id: `preview-${student.id}`,
          workspace_id: student.workspace_id,
          student_id: student.id,
          user_id: user!.id,
          invited_email: "",
          status: "ativo",
          accepted_at: new Date().toISOString(),
          workspace_name: workspace.name,
          currency: workspace.currency,
          is_preview: true,
          student_name: student.name,
        } as StudentPortalAccess;
      }
      const { data, error } = await (supabase as any).rpc("current_student_portal_access");
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as StudentPortalAccess | null;
    },
  });
}
