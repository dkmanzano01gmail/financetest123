import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { mergeLabelOverrides } from "@/lib/customization-schema";

export type LabelMap = Record<string, string>;

export function useLabelOverrides(workspaceId?: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ["label-overrides", workspaceId, userId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<LabelMap> => {
      const { data, error } = await supabase
        .from("customizations")
        .select(
          "type, configuration_json, is_active, is_testing, menu_key, updated_at, target_scope, target_user_id",
        )
        .eq("workspace_id", workspaceId!)
        .eq("type", "label_rename")
        .eq("is_active", true);
      if (error) return {};
      // Precedence: user scope > workspace, testing > definitive, newest first.
      return mergeLabelOverrides((data ?? []) as any[], userId);
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function applyLabel(map: LabelMap | undefined, key: string, fallback: string) {
  return (map && map[key]) || fallback;
}
