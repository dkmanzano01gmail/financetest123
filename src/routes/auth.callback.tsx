import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const url = window.location.href;
        const hasCode = new URL(url).searchParams.get("code");
        const hasHashToken = window.location.hash.includes("access_token");

        if (hasCode) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(url);
          if (exErr) throw exErr;
        } else if (!hasHashToken) {
          // Session may already be set (popup/web_message flow). Verify below.
        }

        // Poll briefly for the session to be available
        let session = null as Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            session = data.session;
            break;
          }
          await new Promise((r) => setTimeout(r, 150));
        }

        if (cancelled) return;
        if (!session) throw new Error("Sessão não encontrada após o login.");

        navigate({ to: "/dashboard", replace: true });
      } catch (e: any) {
        console.error("[auth/callback] erro:", e);
        if (!cancelled) setError(e?.message ?? "Falha ao concluir o login.");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="inline-flex w-12 h-12 rounded-full bg-destructive/10 text-destructive items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-display font-semibold">Não foi possível concluir o login</h1>
          <p className="text-sm text-muted-foreground break-words">{error}</p>
          <p className="text-xs text-muted-foreground">
            Verifique se as URLs de redirecionamento estão configuradas no provedor (incluindo
            <code className="mx-1">{typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "/auth/callback"}</code>).
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth", replace: true })}>
              Voltar ao login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">Entrando com Google...</p>
      </div>
    </div>
  );
}