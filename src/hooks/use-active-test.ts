import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type ActiveTest = {
  id: string;
  workspace_id: string;
  request_text: string;
  ai_interpretation: any;
  auto_applied: boolean;
  complexity: string | null;
  tested_at: string | null;
  target_scope?: "user" | "workspace";
  target_user_id?: string | null;
} | null;

export function useActiveTest(workspaceId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ["active-test", workspaceId, userId],
    enabled: !!workspaceId && !!userId,
    refetchInterval: 8000,
    queryFn: async (): Promise<ActiveTest> => {
      const { data, error } = await (supabase as any)
        .from("customization_requests")
        .select(
          "id, workspace_id, request_text, ai_interpretation, auto_applied, complexity, tested_at, target_scope, target_user_id",
        )
        .eq("workspace_id", workspaceId!)
        .eq("status", "testing")
        .or(`target_scope.eq.workspace,target_user_id.eq.${userId}`)
        .order("tested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as ActiveTest;
    },
  });
}
