import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveTest } from "@/hooks/use-active-test";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { userApproveTest, userRejectTest } from "@/lib/customizations.functions";
import { Button } from "@/components/ui/button";
import { Check, X, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function TestingBanner() {
  const { workspace } = useCurrentWorkspace();
  const wsId = workspace?.id;
  const { data: test } = useActiveTest(wsId);
  const qc = useQueryClient();
  const approveFn = useServerFn(userApproveTest);
  const rejectFn = useServerFn(userRejectTest);

  const approve = useMutation({
    mutationFn: async () => approveFn({ data: { request_id: test!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-test", wsId] });
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      toast.success("Personalização aprovada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: async () => rejectFn({ data: { request_id: test!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-test", wsId] });
      qc.invalidateQueries({ queryKey: ["customization-requests", wsId] });
      qc.invalidateQueries({ queryKey: ["customizations", wsId] });
      qc.invalidateQueries({ queryKey: ["categories", wsId] });
      toast.success("Personalização revertida. O app voltou ao estado anterior.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!test) return null;
  const summary = test.ai_interpretation?.summary ?? test.request_text;
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-start gap-3 flex-wrap">
        <FlaskConical className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-[200px] text-sm">
          <span className="font-semibold">Testando personalização:</span>{" "}
          <span>{summary}</span>
          <div className="text-xs text-amber-800/80 mt-0.5">
            Navegue pelo app para conferir. Aprove para manter ou rejeite para reverter.
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => reject.mutate()} disabled={busy} className="border-amber-400 text-amber-900 hover:bg-amber-100">
            {reject.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1" />}
            Rejeitar e reverter
          </Button>
          <Button size="sm" onClick={() => approve.mutate()} disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white">
            {approve.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
            Aprovar mudança
          </Button>
        </div>
      </div>
    </div>
  );
}