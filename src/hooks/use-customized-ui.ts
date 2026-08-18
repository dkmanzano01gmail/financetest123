import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resolveVisibility, sortByPrecedence } from "@/lib/customization-schema";

/**
 * Reads runtime customizations and exposes ready-to-consume shapes:
 *  - hiddenNav: Set of menu_keys to hide from sidebar/mobile nav
 *  - navOrder:  desired NAV_KEY order (empty = use default)
 *  - hiddenCards: Set of card_ids to omit
 *  - cardOrder: desired CARD_KEY order
 *  - savedFilters: rows the Transações page can apply
 * Testing rows take precedence over definitive rows (sorted is_testing desc).
 */
export function useCustomizedUI(workspaceId?: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const q = useQuery({
    queryKey: ["customizations-ui", workspaceId, userId],
    enabled: !!workspaceId,
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customizations")
        .select(
          "id,type,name,configuration_json,is_active,is_testing,updated_at,target_scope,target_user_id",
        )
        .eq("workspace_id", workspaceId!)
        .eq("is_active", true);
      if (error) return [] as any[];
      return sortByPrecedence((data ?? []) as any[], userId);
    },
  });

  const rows = q.data ?? [];

  const hiddenNav = useMemo(() => {
    const visibility = resolveVisibility(rows, "nav_visibility", "menu_key", userId);
    return new Set([...visibility].filter(([, visible]) => !visible).map(([key]) => key));
  }, [rows, userId]);

  const navOrder = useMemo<string[]>(() => {
    const r = rows.find((x) => x.type === "nav_reorder");
    const o = r?.configuration_json?.order;
    return Array.isArray(o) ? o.filter((k: any) => typeof k === "string") : [];
  }, [rows]);

  const hiddenCards = useMemo(() => {
    const visibility = resolveVisibility(rows, "card_visibility", "card_id", userId);
    return new Set([...visibility].filter(([, visible]) => !visible).map(([key]) => key));
  }, [rows, userId]);

  const cardOrder = useMemo<string[]>(() => {
    const r = rows.find((x) => x.type === "dashboard_widget_order");
    const o = r?.configuration_json?.order;
    return Array.isArray(o) ? o.filter((k: any) => typeof k === "string") : [];
  }, [rows]);

  const savedFilters = useMemo(() => rows.filter((r) => r.type === "saved_filter"), [rows]);

  const dashboardProfitSummaryEnabled = rows.some((row) => row.type === "dashboard_profit_summary");

  return {
    ...q,
    hiddenNav,
    navOrder,
    hiddenCards,
    cardOrder,
    savedFilters,
    dashboardProfitSummaryEnabled,
  };
}

/** Apply hidden + order to a list of nav items keyed by `.key`. */
export function arrangeNav<T extends { key: string }>(
  items: T[],
  order: string[],
  hidden: Set<string>,
): T[] {
  const filtered = items.filter((i) => !hidden.has(i.key));
  if (order.length === 0) return filtered;
  const map = new Map(filtered.map((i) => [i.key, i] as const));
  const ordered: T[] = [];
  for (const k of order) {
    const it = map.get(k);
    if (it) {
      ordered.push(it);
      map.delete(k);
    }
  }
  // append any unspecified items at the end (stable)
  for (const it of filtered) if (map.has(it.key)) ordered.push(it);
  return ordered;
}
