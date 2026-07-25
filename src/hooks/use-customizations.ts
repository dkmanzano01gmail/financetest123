import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LabelMap } from "@/lib/labels";

export type Customization = {
  id: string;
  workspace_id: string;
  type: string;
  name: string;
  description: string | null;
  configuration_json: any;
  is_active: boolean;
  created_by: string;
  request_id: string | null;
  created_at: string;
  updated_at: string;
};

export function useCustomizations(workspaceId: string | undefined) {
  const query = useQuery({
    queryKey: ["customizations", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customizations")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customization[];
    },
  });

  const active = useMemo(() => (query.data ?? []).filter((c) => c.is_active), [query.data]);

  const labelOverrides = useMemo<Partial<LabelMap>>(() => {
    const acc: Partial<LabelMap> = {};
    for (const c of active) {
      if (c.type === "label_rename") {
        const map = c.configuration_json?.labels ?? {};
        Object.assign(acc, map);
      }
    }
    return acc;
  }, [active]);

  const hiddenCards = useMemo(() => {
    const set = new Set<string>();
    for (const c of active) {
      if (c.type === "card_visibility" && c.configuration_json?.visible === false) {
        set.add(String(c.configuration_json?.card_id ?? ""));
      }
    }
    return set;
  }, [active]);

  const savedFilters = useMemo(() => active.filter((c) => c.type === "saved_filter"), [active]);

  const categoryRules = useMemo(() => active.filter((c) => c.type === "category_rule"), [active]);

  return {
    ...query,
    customizations: query.data ?? [],
    active,
    labelOverrides,
    hiddenCards,
    savedFilters,
    categoryRules,
  };
}
