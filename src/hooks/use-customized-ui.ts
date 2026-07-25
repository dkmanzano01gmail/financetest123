import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const q = useQuery({
    queryKey: ["customizations-ui", workspaceId],
    enabled: !!workspaceId,
    staleTime: 5_000,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customizations")
        .select("id,type,name,configuration_json,is_active,is_testing,updated_at")
        .eq("workspace_id", workspaceId!)
        .eq("is_active", true)
        .order("is_testing", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) return [] as any[];
      return (data ?? []) as any[];
    },
  });

  const rows = q.data ?? [];

  const hiddenNav = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const cfg = r.configuration_json ?? {};
      // Accept both the canonical shape and a nested { nav_visibility: {...} } shape
      // that older AI responses produced.
      const nested = cfg.nav_visibility ?? null;
      const isNavType =
        r.type === "nav_visibility" ||
        (nested && typeof nested === "object") ||
        (typeof cfg.menu_key === "string" && cfg.card_id == null);
      if (!isNavType) continue;
      const payload = nested && typeof nested === "object" ? nested : cfg;
      if (payload.visible === false && typeof payload.menu_key === "string") {
        s.add(payload.menu_key);
      }
    }
    return s;
  }, [rows]);

  const navOrder = useMemo<string[]>(() => {
    const r = rows.find((x) => x.type === "nav_reorder");
    const o = r?.configuration_json?.order;
    return Array.isArray(o) ? o.filter((k: any) => typeof k === "string") : [];
  }, [rows]);

  const hiddenCards = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.type === "card_visibility" && r.configuration_json?.visible === false) {
        const k = r.configuration_json?.card_id;
        if (typeof k === "string") s.add(k);
      }
    }
    return s;
  }, [rows]);

  const cardOrder = useMemo<string[]>(() => {
    const r = rows.find((x) => x.type === "dashboard_widget_order");
    const o = r?.configuration_json?.order;
    return Array.isArray(o) ? o.filter((k: any) => typeof k === "string") : [];
  }, [rows]);

  const savedFilters = useMemo(() => rows.filter((r) => r.type === "saved_filter"), [rows]);

  return { ...q, hiddenNav, navOrder, hiddenCards, cardOrder, savedFilters };
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
