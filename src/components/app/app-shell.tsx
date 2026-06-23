import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ArrowLeftRight, Wallet, CreditCard, Tags, Settings, Eye, EyeOff, LogOut, ChevronDown, Plus, Sparkles, Upload } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";

const nav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transações" },
  { to: "/accounts", icon: Wallet, label: "Contas" },
  { to: "/cards", icon: CreditCard, label: "Cartões" },
  { to: "/categories", icon: Tags, label: "Categorias" },
  { to: "/import", icon: Upload, label: "Importar" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { workspace, workspaces, switchTo, loading } = useCurrentWorkspace();

  // Redirect to onboarding if no workspace
  useEffect(() => {
    if (!loading && workspaces.length === 0 && pathname !== "/onboarding") {
      navigate({ to: "/onboarding" });
    }
  }, [loading, workspaces.length, pathname, navigate]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function togglePrivacy() {
    if (!workspace) return;
    const { error } = await supabase
      .from("workspaces")
      .update({ privacy_mode: !workspace.privacy_mode })
      .eq("id", workspace.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workspaces"] });
  }

  if (pathname === "/onboarding") return <Outlet />;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold">O</div>
          <div>
            <div className="font-display font-semibold leading-tight">Orna</div>
            <div className="text-xs text-sidebar-foreground/60">Financeiro</div>
          </div>
        </div>

        {/* Workspace switcher */}
        <div className="px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 bg-sidebar-accent/40 hover:bg-sidebar-accent text-left transition">
                <div className="min-w-0">
                  <div className="text-xs text-sidebar-foreground/60 uppercase tracking-wide">Workspace</div>
                  <div className="truncate font-medium">{workspace?.name ?? "—"}</div>
                </div>
                <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60">
              <DropdownMenuLabel>Seus workspaces</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
                  <span className="flex-1 truncate">{w.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{w.type === "personal" ? "Pessoal" : "Negócio"}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
                <Plus className="w-4 h-4 mr-2" />Novo workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <div className="rounded-lg bg-sidebar-accent/40 p-3 mb-2">
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-sidebar-primary" />
              <span className="font-medium">Personalizações</span>
            </div>
            <p className="text-xs text-sidebar-foreground/60 mt-1">Em breve: peça mudanças no app em linguagem natural.</p>
          </div>
          <button onClick={togglePrivacy} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
            {workspace?.privacy_mode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {workspace?.privacy_mode ? "Mostrar valores" : "Modo privacidade"}
          </button>
          <button onClick={signOut} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold text-sm">O</div>
            <span className="font-display font-semibold">{workspace?.name ?? "Orna"}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={togglePrivacy} className="text-sidebar-foreground">
            {workspace?.privacy_mode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </header>

        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden grid grid-cols-5 border-t bg-card">
          {nav.slice(0, 5).map((item) => {
            const active = pathname === item.to;
            return (
              <Link key={item.to} to={item.to} className={`flex flex-col items-center gap-1 py-2 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon className="w-5 h-5" /> {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
