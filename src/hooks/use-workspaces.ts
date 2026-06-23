import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentWorkspaceId, setCurrentWorkspaceId } from "@/lib/workspace-storage";

export type Workspace = {
  id: string;
  name: string;
  type: "personal" | "business";
  currency: string;
  country: string;
  privacy_mode: boolean;
  owner_id: string;
  plan?: string;
};

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Workspace[];
    },
  });
}

export function useCurrentWorkspace() {
  const { data: workspaces, isLoading } = useWorkspaces();
  const [currentId, setCurrentId] = useState<string | null>(() => getCurrentWorkspaceId());

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;
    if (!currentId || !workspaces.find((w) => w.id === currentId)) {
      const id = workspaces[0].id;
      setCurrentId(id);
      setCurrentWorkspaceId(id);
    }
  }, [workspaces, currentId]);

  const switchTo = (id: string) => {
    setCurrentId(id);
    setCurrentWorkspaceId(id);
  };

  const workspace = workspaces?.find((w) => w.id === currentId) ?? null;
  return { workspace, workspaces: workspaces ?? [], loading: isLoading, switchTo };
}
