import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { walletFromLedger, type LedgerEntry } from "@/lib/billing";

const sb = supabase as any;

export function useBillingSettings() {
  return useQuery({
    queryKey: ["billing-settings"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await sb.from("billing_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as {
        simulation_enabled: boolean;
        credit_reference_value: number;
        default_payment_fee_percent: number;
      } | null;
    },
  });
}

export function useCreditPacks() {
  return useQuery({
    queryKey: ["credit-packs"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from("credit_packs")
        .select("*")
        .eq("is_active", true)
        .order("credits");
      if (error) throw error;
      return (data ?? []) as { code: string; name: string; credits: number; price: number }[];
    },
  });
}

export function useSubscription() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("subscriptions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

export function useCreditLedger() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["credit-ledger", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("credit_ledger")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Wallet derived from the ledger (mirrors the SQL view). */
export function useCreditWallet() {
  const ledger = useCreditLedger();
  const entries: LedgerEntry[] = (ledger.data ?? []).map((row: any) => ({
    type: row.type,
    credits_delta: Number(row.credits_delta) || 0,
  }));
  const monthKey = new Date().toISOString().slice(0, 7);
  const grantedThisMonth = (ledger.data ?? [])
    .filter((r: any) => r.type === "monthly_grant" && String(r.created_at).slice(0, 7) === monthKey)
    .reduce((sum: number, r: any) => sum + (Number(r.credits_delta) || 0), 0);
  return {
    ...walletFromLedger(entries),
    grantedThisMonth,
    isLoading: ledger.isLoading,
    ledger: ledger.data ?? [],
  };
}

export function usePayments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payments", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await sb
        .from("payments")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
