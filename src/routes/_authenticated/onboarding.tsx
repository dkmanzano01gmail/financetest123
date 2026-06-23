import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { setCurrentWorkspaceId } from "@/lib/workspace-storage";
import { Loader2, User, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<"personal" | "business">("personal");
  const [currency, setCurrency] = useState("BRL");
  const [initialBalance, setInitialBalance] = useState("");
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setLoading(false); return; }

    const { error } = await supabase
      .from("workspaces")
      .insert({ name, type, currency, country: "BR", owner_id: userId });

    if (error) { setLoading(false); return toast.error(error.message); }

    const { data: workspaces, error: listError } = await supabase
      .from("workspaces")
      .select("*")
      .eq("owner_id", userId)
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1);

    const ws = workspaces?.[0];
    if (listError || !ws) { setLoading(false); return toast.error(listError?.message ?? "Workspace criado, mas não foi possível carregá-lo."); }

    if (accountName.trim()) {
      const bal = Number(initialBalance.replace(",", ".") || 0);
      await supabase.from("accounts").insert({
        workspace_id: ws.id,
        name: accountName,
        type: "checking",
        initial_balance: bal,
      });
    }

    setCurrentWorkspaceId(ws.id);
    await qc.invalidateQueries({ queryKey: ["workspaces"] });
    setLoading(false);
    toast.success("Workspace criado!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/60">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Crie seu workspace</CardTitle>
          <CardDescription>Organize suas finanças pessoais ou de um negócio.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="wname">Nome do workspace</Label>
              <Input id="wname" required placeholder="Ex.: Daniel — Pessoal" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as "personal" | "business")} className="grid grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${type === "personal" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value="personal" className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 font-medium"><User className="w-4 h-4" />Pessoal</div>
                    <p className="text-xs text-muted-foreground mt-1">Entradas, Gastos, Saldo.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${type === "business" ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value="business" className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 font-medium"><Building2 className="w-4 h-4" />Negócio</div>
                    <p className="text-xs text-muted-foreground mt-1">Receitas, Despesas, Lucro.</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="curr">Moeda</Label>
                <Input id="curr" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bal">Saldo inicial (opcional)</Label>
                <Input id="bal" placeholder="0,00" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc">Conta principal (opcional)</Label>
              <Input id="acc" placeholder="Ex.: Conta Nubank" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
