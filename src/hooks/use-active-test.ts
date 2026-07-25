import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ActiveTest = {
  id: string;
  workspace_id: string;
  request_text: string;
  ai_interpretation: any;
  auto_applied: boolean;
  complexity: string | null;
  tested_at: string | null;
} | null;

export function useActiveTest(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["active-test", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 8000,
    queryFn: async (): Promise<ActiveTest> => {
      const { data, error } = await (supabase as any)
        .from("customization_requests")
        .select(
          "id, workspace_id, request_text, ai_interpretation, auto_applied, complexity, tested_at",
        )
        .eq("workspace_id", workspaceId!)
        .eq("status", "testing")
        .order("tested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as ActiveTest;
    },
  });
}
