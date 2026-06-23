import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useIsSuperAdmin() {
  return useQuery({
    queryKey: ["super-admin"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data, error } = await (supabase as any)
        .from("super_admins")
        .select("user_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
}