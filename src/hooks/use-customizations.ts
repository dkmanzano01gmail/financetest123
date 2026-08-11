import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  mergeLabelOverrides,
  resolveVisibility,
  sortByPrecedence,
} from "@/lib/customization-schema";
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
  is_testing?: boolean;
  target_scope?: "user" | "workspace";
  target_user_id?: string | null;
};

export function useCustomizations(workspaceId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const query = useQuery({
    queryKey: ["customizations", workspaceId, userId],
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

  const active = useMemo(
    () => sortByPrecedence((query.data ?? []) as any[], userId) as Customization[],
    [query.data, userId],
  );

  const labelOverrides = useMemo<Partial<LabelMap>>(() => {
    return mergeLabelOverrides((query.data ?? []) as any[], userId);
  }, [query.data, userId]);

  const hiddenCards = useMemo(() => {
    const visibility = resolveVisibility(
      (query.data ?? []) as any[],
      "card_visibility",
      "card_id",
      userId,
    );
    return new Set([...visibility].filter(([, visible]) => !visible).map(([key]) => key));
  }, [query.data, userId]);

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
