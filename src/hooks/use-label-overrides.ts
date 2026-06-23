import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LabelMap = Record<string, string>;

export function useLabelOverrides(workspaceId?: string) {
  return useQuery({
    queryKey: ["label-overrides", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<LabelMap> => {
      const { data, error } = await supabase
        .from("customizations")
        .select("type, configuration_json, is_active")
        .eq("workspace_id", workspaceId!)
        .eq("type", "label_rename")
        .eq("is_active", true);
      if (error) return {};
      const merged: LabelMap = {};
      for (const row of (data ?? []) as any[]) {
        const labels = row?.configuration_json?.labels;
        if (labels && typeof labels === "object") {
          for (const [k, v] of Object.entries(labels)) {
            if (typeof v === "string" && v.trim()) merged[k] = v;
          }
        }
      }
      return merged;
    },
    staleTime: 30_000,
  });
}

export function applyLabel(map: LabelMap | undefined, key: string, fallback: string) {
  return (map && map[key]) || fallback;
}
