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
        .select("type, configuration_json, is_active, is_testing, menu_key, updated_at")
        .eq("workspace_id", workspaceId!)
        .eq("type", "label_rename")
        .eq("is_active", true)
        .order("is_testing", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) return {};
      // Precedence: testing > definitive. First-seen key wins because we
      // sorted testing rows first.
      const merged: LabelMap = {};
      for (const row of (data ?? []) as any[]) {
        const labels = row?.configuration_json?.labels;
        if (labels && typeof labels === "object") {
          for (const [k, v] of Object.entries(labels)) {
            if (typeof v === "string" && v.trim() && !(k in merged)) merged[k] = v;
          }
        }
      }
      return merged;
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function applyLabel(map: LabelMap | undefined, key: string, fallback: string) {
  return (map && map[key]) || fallback;
}
