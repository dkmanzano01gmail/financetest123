import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  loadSuggestionContext, suggestForTransaction, labelImp, importanceBadgeClass,
  type Importance, type Suggestion, type SuggestionInput,
} from "@/lib/suggestions";

type Row = {
  tx: SuggestionInput & { current_category_name?: string | null };
  suggestion: Suggestion;
  applyCategory: boolean;
  applyImportance: boolean;
  overrideImportance: Importance;
  overrideCategoryId: string | null;
  selected: boolean;
};

export function SuggestReviewDialog({
  open, onOpenChange, workspaceId, workspaceType, transactions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  workspaceType: "personal" | "business";
  transactions: SuggestionInput[] & { current_category_name?: string | null }[];
}) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; type: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ctx = await loadSuggestionContext(workspaceId, workspaceType);
      if (cancelled) return;
      setCategories(ctx.categories);
      const built: Row[] = transactions.map((tx) => {
        const s = suggestForTransaction(tx, ctx);
        return {
          tx,
          suggestion: s,
          applyCategory: !tx.category_id && !!s.category_id,
          applyImportance: true,
          overrideImportance: s.importance,
          overrideCategoryId: s.category_id,
          selected: true,
        };
      });
      setRows(built);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, workspaceType, transactions]);

  const summary = useMemo(() => {
    const selected = rows.filter((r) => r.selected);
    return {
      total: rows.length,
      selected: selected.length,
      changes: selected.filter((r) => r.applyCategory || r.applyImportance).length,
    };
  }, [rows]);

  const applyMut = useMutation({
    mutationFn: async () => {
      const toApply = rows.filter((r) => r.selected && (r.applyCategory || r.applyImportance));
      const now = new Date().toISOString();
      for (const r of toApply) {
        const patch: Record<string, any> = {
          suggested_category_id: r.suggestion.category_id,
          suggested_importance_level: r.suggestion.importance,
          importance_confidence: r.suggestion.confidence,
          importance_suggestion_reason: r.suggestion.reason,
          importance_status: "suggested",
        };
        if (r.applyCategory && r.overrideCategoryId) {
          patch.category_id = r.overrideCategoryId;
        }
        if (r.applyImportance) {
          patch.importance_level = r.overrideImportance;
          patch.importance_confirmed_by_user = true;
          patch.importance_confirmed_at = now;
          patch.importance_status = "confirmed";
        }
        const { error } = await supabase.from("transactions" as any).update(patch).eq("id", r.tx.id);
        if (error) throw error;
      }
      return toApply.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} transações atualizadas`);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["ba-txs"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Revisar sugestões</DialogTitle>
          <DialogDescription>
            Sugestões de categoria e importância financeira. Revise antes de aplicar — nada é alterado sem sua confirmação.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Calculando sugestões…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">Nenhuma transação na seleção atual.</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto -mx-6 px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Transação</TableHead>
                  <TableHead>Categoria sugerida</TableHead>
                  <TableHead>Importância sugerida</TableHead>
                  <TableHead>Confiança</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => {
                  const filteredCats = categories.filter((c) => c.type === r.tx.type);
                  return (
                    <TableRow key={r.tx.id}>
                      <TableCell>
                        <Checkbox checked={r.selected} onCheckedChange={(v) => setRows((p) => p.map((x, i) => i === idx ? { ...x, selected: !!v } : x))} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{r.tx.description}</div>
                        <div className="text-xs text-muted-foreground">
                          Atual: {r.tx.current_category_name ?? "Sem categoria"}
                          {r.tx.importance_level && <> · <Badge variant="secondary" className={importanceBadgeClass(r.tx.importance_level)}>{labelImp(r.tx.importance_level)}</Badge></>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={r.applyCategory} disabled={!r.overrideCategoryId} onCheckedChange={(v) => setRows((p) => p.map((x, i) => i === idx ? { ...x, applyCategory: !!v } : x))} />
                          <Select value={r.overrideCategoryId ?? ""} onValueChange={(v) => setRows((p) => p.map((x, i) => i === idx ? { ...x, overrideCategoryId: v || null, applyCategory: true } : x))}>
                            <SelectTrigger className="h-8 w-40"><SelectValue placeholder={r.suggestion.category_name ?? "—"} /></SelectTrigger>
                            <SelectContent>
                              {filteredCats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={r.applyImportance} onCheckedChange={(v) => setRows((p) => p.map((x, i) => i === idx ? { ...x, applyImportance: !!v } : x))} />
                          <Select value={r.overrideImportance} onValueChange={(v) => setRows((p) => p.map((x, i) => i === idx ? { ...x, overrideImportance: v as Importance, applyImportance: true } : x))}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="essential">Essencial</SelectItem>
                              <SelectItem value="important">Importante</SelectItem>
                              <SelectItem value="flexible">Flexível</SelectItem>
                              <SelectItem value="superfluous">Supérfluo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{Math.round(r.suggestion.confidence * 100)}%</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">{r.suggestion.reason}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {summary.selected} selecionadas · {summary.changes} com mudanças
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => applyMut.mutate()} disabled={applyMut.isPending || summary.changes === 0}>
              {applyMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aplicar sugestões
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}