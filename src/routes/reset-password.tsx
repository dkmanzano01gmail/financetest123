import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

type RecoveryState = "checking" | "ready" | "invalid" | "updated";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setRecoveryState("ready");
    });

    async function prepareRecoverySession() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const authError = url.searchParams.get("error_description") ?? hash.get("error_description");

      if (authError) {
        if (active) setRecoveryState("invalid");
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (active) setRecoveryState("invalid");
          return;
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (active) setRecoveryState("ready");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }

      if (active) setRecoveryState("invalid");
    }

    void prepareRecoverySession();

    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      return toast.error("A nova senha precisa ter pelo menos 8 caracteres.");
    }
    if (password !== confirmPassword) {
      return toast.error("As senhas informadas não são iguais.");
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      return toast.error(
        "Não foi possível atualizar a senha. Solicite um novo link e tente novamente.",
      );
    }

    setRecoveryState("updated");
    await supabase.auth.signOut({ scope: "local" });
  }

  function goToLogin() {
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center" aria-label="Selá Finance">
          <img
            src="/sela-finance-logo.png"
            alt="Selá Finance"
            className="h-24 w-auto max-w-[17rem] object-contain"
          />
        </div>
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Criar nova senha</CardTitle>
            <CardDescription>Defina uma senha nova para acessar sua conta.</CardDescription>
          </CardHeader>
          <CardContent>
            {recoveryState === "checking" && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando o link de recuperação...
              </div>
            )}

            {recoveryState === "invalid" && (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                  <p>Este link é inválido ou expirou. Solicite um novo link na página de login.</p>
                </div>
                <Button type="button" className="w-full" onClick={goToLogin}>
                  Voltar ao login
                </Button>
              </div>
            )}

            {recoveryState === "ready" && (
              <form onSubmit={updatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar nova senha
                </Button>
              </form>
            )}

            {recoveryState === "updated" && (
              <div className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-4 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  <p>Sua senha foi atualizada. Entre novamente usando a nova senha.</p>
                </div>
                <Button type="button" className="w-full" onClick={goToLogin}>
                  Ir para o login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
