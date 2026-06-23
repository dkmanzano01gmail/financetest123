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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { L } from "@/lib/labels";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/categories")({ component: CategoriesPage });

function CategoriesPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [color, setColor] = useState("#c2410c");
  const wsId = workspace?.id;
  const t = workspace ? L(workspace.type) : L("personal");

  const { data: categories } = useQuery({
    queryKey: ["categories", wsId],
    enabled: !!wsId,
    queryFn: async () => (await supabase.from("categories").select("*").eq("workspace_id", wsId!).order("name")).data ?? [],
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("categories").insert({ workspace_id: wsId!, name, type, color });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Categoria criada"); setOpen(false); setName(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const income = (categories ?? []).filter((c: any) => c.type === "income");
  const expense = (categories ?? []).filter((c: any) => c.type === "expense");

  return (
    <PageContainer>
      <PageHeader title="Categorias" description="Organize entradas e saídas"
        action={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Nova categoria</Button>} />

      <Tabs defaultValue="expense">
        <TabsList>
          <TabsTrigger value="expense">{t.expense} ({expense.length})</TabsTrigger>
          <TabsTrigger value="income">{t.income} ({income.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="expense"><CategoryGrid items={expense} onDelete={(id) => deleteMut.mutate(id)} /></TabsContent>
        <TabsContent value="income"><CategoryGrid items={income} onDelete={(id) => deleteMut.mutate(id)} /></TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t.incomeSingular}</SelectItem>
                  <SelectItem value="expense">{t.expenseSingular}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Cor</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function CategoryGrid({ items, onDelete }: { items: any[]; onDelete: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
      {items.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full shrink-0" style={{ background: c.color }} />
            <div className="flex-1 min-w-0 font-medium truncate">{c.name}</div>
            <Button variant="ghost" size="icon" onClick={() => onDelete(c.id)}><Trash2 className="w-4 h-4 text-muted-foreground" /></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
