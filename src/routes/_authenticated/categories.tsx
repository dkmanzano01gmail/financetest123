import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { L } from "@/lib/labels";
import { labelImp, importanceBadgeClass, type Importance } from "@/lib/suggestions";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/categories")({ component: CategoriesPage });

type CatForm = {
  name: string;
  type: "income" | "expense";
  color: string;
  is_active: boolean;
  importance_level: Importance;
  importance_comment: string;
  is_cuttable: boolean;
  cut_priority: string;
};

const emptyForm = (): CatForm => ({
  name: "",
  type: "expense",
  color: "#c2410c",
  is_active: true,
  importance_level: "flexible",
  importance_comment: "",
  is_cuttable: false,
  cut_priority: "0",
});

function CategoriesPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const t = workspace ? L(workspace.type) : L("personal");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CatForm>(emptyForm());
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);
  const [inactivateFallback, setInactivateFallback] = useState<{ id: string; name: string } | null>(
    null,
  );

  const {
    data: categories,
    error: catsError,
    isLoading,
  } = useQuery({
    queryKey: ["categories", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("workspace_id", wsId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  }
  function openEdit(c: any) {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      type: (c.type ?? "expense") as any,
      color: c.color ?? "#c2410c",
      is_active: !!c.is_active,
      importance_level: (c.importance_level ?? "flexible") as Importance,
      importance_comment: c.importance_comment ?? "",
      is_cuttable: !!c.is_cuttable,
      cut_priority: String(c.cut_priority ?? 0),
    });
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (!name) throw new Error("Informe o nome da categoria.");
      const cutN = Number(form.cut_priority);
      const payload: any = {
        name,
        type: form.type,
        color: form.color || "#888888",
        is_active: form.is_active,
        importance_level: form.importance_level,
        importance_comment: form.importance_comment.trim() || null,
        is_cuttable: form.is_cuttable,
        cut_priority: Number.isFinite(cutN) ? cutN : 0,
      };
      if (editingId) {
        const { error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", editingId)
          .eq("workspace_id", wsId!);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("categories")
          .insert({ workspace_id: wsId!, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["ba-txs"] });
      toast.success(editingId ? "Categoria atualizada" : "Categoria criada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria removida");
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      const isFk = /foreign key|violates|referenc/i.test(msg);
      if (isFk && confirm) {
        // Close the first confirm dialog before opening the fallback so
        // they don't stack (Radix locks scroll on nested modals).
        const c = confirm;
        setConfirm(null);
        setInactivateFallback({ id: c.id, name: c.name });
      } else {
        toast.error(msg);
      }
    },
  });

  const inactivateMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("categories")
        .update({ is_active: false } as any)
        .eq("id", id)
        .eq("workspace_id", wsId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria inativada");
      setInactivateFallback(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const income = (categories ?? []).filter((c: any) => c.type === "income");
  const expense = (categories ?? []).filter((c: any) => c.type === "expense");

  return (
    <PageContainer>
      <PageHeader
        title="Categorias"
        description="Organize entradas e saídas — use o comentário para orientar a auto-classificação."
        action={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" />
            Nova categoria
          </Button>
        }
      />

      {catsError && (
        <div className="mb-3 text-sm text-destructive">
          Erro ao carregar: {(catsError as any).message}
        </div>
      )}
      {isLoading && <div className="mb-3 text-sm text-muted-foreground">Carregando…</div>}

      <Tabs defaultValue="expense">
        <TabsList>
          <TabsTrigger value="expense">
            {t.expense} ({expense.length})
          </TabsTrigger>
          <TabsTrigger value="income">
            {t.income} ({income.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="expense">
          <CategoryGrid
            items={expense}
            onEdit={openEdit}
            onDelete={(c) => setConfirm({ id: c.id, name: c.name })}
          />
        </TabsContent>
        <TabsContent value="income">
          <CategoryGrid
            items={income}
            onEdit={openEdit}
            onDelete={(c) => setConfirm({ id: c.id, name: c.name })}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar categoria" : "Nova categoria"}</DialogTitle>
            <DialogDescription>
              O comentário é usado para orientar a auto-classificação: cite palavras-chave que
              aparecem nas descrições.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">{t.incomeSingular}</SelectItem>
                    <SelectItem value="expense">{t.expenseSingular}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <Input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-20 p-1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Importância padrão</Label>
                <Select
                  value={form.importance_level}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, importance_level: v as Importance }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essential">Essencial</SelectItem>
                    <SelectItem value="important">Importante</SelectItem>
                    <SelectItem value="flexible">Flexível</SelectItem>
                    <SelectItem value="superfluous">Supérfluo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Comentário / palavras-chave</Label>
              <Textarea
                rows={3}
                value={form.importance_comment}
                onChange={(e) => setForm((f) => ({ ...f, importance_comment: e.target.value }))}
                placeholder="Ex.: ifood, restaurante, delivery — usado para sugerir esta categoria."
              />
            </div>
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label className="text-sm">Ativa</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_cuttable}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_cuttable: v }))}
                />
                <Label className="text-sm">Pode ser cortada</Label>
              </div>
            </div>
            {form.is_cuttable && (
              <div className="space-y-1.5">
                <Label>Prioridade de corte</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.cut_priority}
                  onChange={(e) => setForm((f) => ({ ...f, cut_priority: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Maior número = corta antes na análise de orçamento.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.name.trim()}
            >
              {saveMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover categoria "{confirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se houver transações usando esta categoria a remoção falha — vamos oferecer inativá-la
              em vez de remover.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) deleteMut.mutate(confirm.id);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!inactivateFallback}
        onOpenChange={(o) => {
          if (!o) setInactivateFallback(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existem transações vinculadas</AlertDialogTitle>
            <AlertDialogDescription>
              "{inactivateFallback?.name}" não pôde ser removida porque há transações usando esta
              categoria. Deseja inativá-la? Ela deixa de aparecer em novos cadastros mas as
              transações antigas continuam intactas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setInactivateFallback(null);
                setConfirm(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (inactivateFallback) {
                  inactivateMut.mutate(inactivateFallback.id);
                  setConfirm(null);
                }
              }}
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function CategoryGrid({
  items,
  onEdit,
  onDelete,
}: {
  items: any[];
  onEdit: (c: any) => void;
  onDelete: (c: any) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-muted-foreground mt-6">Nenhuma categoria — crie uma nova.</div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
      {items.map((c) => (
        <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full shrink-0 border"
                style={{ background: c.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.importance_level && (
                    <Badge
                      variant="secondary"
                      className={importanceBadgeClass(c.importance_level as Importance)}
                    >
                      {labelImp(c.importance_level as Importance)}
                    </Badge>
                  )}
                  {!c.is_active && <Badge variant="outline">Inativa</Badge>}
                  {c.is_cuttable && <Badge variant="outline">Cortável</Badge>}
                </div>
              </div>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" onClick={() => onEdit(c)} title="Editar">
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(c)} title="Remover">
                  <Trash2 className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
            {c.importance_comment && (
              <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {c.importance_comment}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
