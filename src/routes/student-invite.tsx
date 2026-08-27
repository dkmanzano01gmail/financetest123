import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { acceptStudentPortalInvite, getStudentPortalInvite } from "@/lib/student-portal.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/student-invite")({
  ssr: false,
  component: StudentInvitePage,
});

function StudentInvitePage() {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token =
    typeof window === "undefined"
      ? ""
      : new URL(window.location.href).searchParams.get("token") || "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const url = window.location.href;
        if (new URL(url).searchParams.get("code")) {
          const result = await supabase.auth.exchangeCodeForSession(url);
          if (result.error) throw result.error;
        }
        const session = await supabase.auth.getSession();
        if (!session.data.session) throw new Error("Abra novamente o link enviado por e-mail.");
        if (!token) throw new Error("Token do convite não encontrado.");
        const result = await getStudentPortalInvite({ data: { token } });
        if (!cancelled) setInvite(result);
      } catch (cause: any) {
        if (!cancelled) setError(cause?.message || "Não foi possível validar o convite.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setLoading(true);
    setError("");
    try {
      if (invite.requiresPassword) {
        if (password.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
        if (password !== confirm) throw new Error("As senhas não coincidem.");
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
      }
      await acceptStudentPortalInvite({ data: { token } });
      navigate({ to: "/student", replace: true });
    } catch (cause: any) {
      setError(cause?.message || "Não foi possível ativar o portal.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
          <CardTitle>Portal do aluno</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !invite ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando convite…
            </div>
          ) : error && !invite ? (
            <>
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/auth" })}
              >
                Ir para o login
              </Button>
            </>
          ) : invite ? (
            <>
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-medium">{invite.studentName}</div>
                <div className="text-muted-foreground">
                  {invite.workspaceName} · {invite.email}
                </div>
              </div>
              {invite.requiresPassword && (
                <div className="space-y-3">
                  <div>
                    <Label>Crie sua senha</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Confirme a senha</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={accept} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ativar meu acesso
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
