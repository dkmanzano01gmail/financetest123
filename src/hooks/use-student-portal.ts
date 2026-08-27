import { useQuery } from "@tanstack/react-query";
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
};

export function useStudentPortalAccess() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["student-portal-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("current_student_portal_access");
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as StudentPortalAccess | null;
    },
  });
}
