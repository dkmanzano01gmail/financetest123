import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { toast } from "sonner";
import { Sparkles, Palette } from "lucide-react";
import { setCurrentWorkspaceId } from "@/lib/workspace-storage";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<"personal" | "business">("personal");
  const [currency, setCurrency] = useState("BRL");
  const [country, setCountry] = useState("BR");
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name); setType(workspace.type); setCurrency(workspace.currency);
      setCountry(workspace.country); setPrivacy(workspace.privacy_mode);
    }
  }, [workspace?.id]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!workspace) return;
      const { error } = await supabase.from("workspaces").update({ name, type, currency, country, privacy_mode: privacy }).eq("id", workspace.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["workspaces"] }); toast.success("Configurações salvas"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!workspace) return;
      const { error } = await supabase.from("workspaces").delete().eq("id", workspace.id);
      if (error) throw error;
    },
    onSuccess: () => { setCurrentWorkspaceId(null); qc.invalidateQueries({ queryKey: ["workspaces"] }); toast.success("Workspace removido"); navigate({ to: "/onboarding" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      if (!workspace) return;
      const { error } = await (supabase as any).rpc("seed_sela_defaults", { _workspace_id: workspace.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["cards-full"] });
      toast.success("Padrões Selá aplicados (nada foi duplicado).");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!workspace) return null;

  return (
    <PageContainer>
      <PageHeader title="Configurações" description="Gerencie o workspace atual" />

      <div className="grid gap-4 max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Pessoal</SelectItem>
                    <SelectItem value="business">Negócio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Moeda</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>
            </div>
            <div className="space-y-1.5"><Label>País</Label><Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} /></div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="font-medium text-sm">Modo privacidade</div>
                <div className="text-xs text-muted-foreground">Oculta valores financeiros sensíveis.</div>
              </div>
              <Switch checked={privacy} onCheckedChange={setPrivacy} />
            </div>
            <div className="flex gap-2"><Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Salvar</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Personalizações</CardTitle>
            <CardDescription>Peça mudanças no app em linguagem natural. Cada workspace tem créditos mensais de personalização.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={() => navigate({ to: "/customizations" })}>Abrir Personalizações</Button>
          </CardContent>
        </Card>

        {workspace.type === "business" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette className="w-4 h-4 text-primary" />Padrões Selá Cerâmica</CardTitle>
              <CardDescription>Cria categorias, contas e cartão padrão do ateliê. É idempotente: nada existente é duplicado ou sobrescrito.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" onClick={() => seedMut.mutate()} disabled={seedMut.isPending}>Aplicar padrões Selá</Button>
            </CardContent>
          </Card>
        )}

        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-destructive">Zona de risco</CardTitle></CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => { if (confirm("Remover este workspace e todos seus dados?")) deleteMut.mutate(); }}>
              Excluir workspace
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
