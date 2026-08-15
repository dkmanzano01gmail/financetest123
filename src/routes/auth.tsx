import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, MessageSquareText } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Bem-vindo.");
    navigate({ to: "/dashboard" });
  }

  async function sendPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      return toast.error(
        "Não foi possível enviar o link agora. Aguarde alguns minutos e tente novamente.",
      );
    }

    setResetSent(true);
  }

  async function google() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      setLoading(false);
      return toast.error(result.error.message);
    }
    if (result.redirected) return;
    navigate({ to: "/auth/callback" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 flex items-center justify-center gap-3" aria-label="Selá Finance">
            <img
              src="/sela-finance-logo.png"
              alt="Selá Finance"
              className="h-24 w-auto max-w-[17rem] object-contain"
            />
            <span className="self-start rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
              Beta
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Seu dashboard financeiro pessoal e de negócios.
          </p>
          <div className="mx-auto mt-4 max-w-sm rounded-2xl border border-accent/50 bg-accent/10 px-4 py-3 text-left shadow-sm">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-primary">
              <MessageSquareText className="h-4 w-4 shrink-0 text-accent" />
              Você está participando da fase de testes
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/75">
              Esta é uma versão beta do Selá Finance. Ao usar o aplicativo, envie comentários sobre
              sua experiência, dúvidas e sugestões. Seu retorno nos ajudará a corrigir problemas e
              melhorar as próximas versões.
            </p>
          </div>
        </div>
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>{forgotPassword ? "Recuperar senha" : "Entrar"}</CardTitle>
            <CardDescription>
              {forgotPassword
                ? "Informe o e-mail usado no cadastro."
                : "Acesse sua conta ou crie uma nova."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forgotPassword ? (
              <form onSubmit={sendPasswordReset} className="space-y-4">
                {resetSent ? (
                  <div
                    className="rounded-lg border border-border bg-muted/50 p-4 text-sm leading-relaxed text-foreground"
                    role="status"
                  >
                    Se existir uma conta com este e-mail, você receberá um link para criar uma nova
                    senha. Verifique também a caixa de spam.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">E-mail</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
                {!resetSent && (
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar link de recuperação
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setForgotPassword(false);
                    setResetSent(false);
                  }}
                  disabled={loading}
                >
                  Voltar ao login
                </Button>
              </form>
            ) : (
              <>
                <Tabs defaultValue="signin">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="signin">Entrar</TabsTrigger>
                    <TabsTrigger value="signup">Criar conta</TabsTrigger>
                  </TabsList>
                  <TabsContent value="signin">
                    <form onSubmit={signIn} className="mt-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="email">E-mail</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="password">Senha</Label>
                          <button
                            type="button"
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => {
                              setForgotPassword(true);
                              setResetSent(false);
                            }}
                          >
                            Esqueci minha senha
                          </button>
                        </div>
                        <Input
                          id="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Entrar
                      </Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="signup">
                    <form onSubmit={signUp} className="mt-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Nome</Label>
                        <Input
                          id="name"
                          autoComplete="name"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email2">E-mail</Label>
                        <Input
                          id="email2"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="password2">Senha</Label>
                        <Input
                          id="password2"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar conta
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">ou</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={google}
                  disabled={loading}
                >
                  Continuar com Google
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
