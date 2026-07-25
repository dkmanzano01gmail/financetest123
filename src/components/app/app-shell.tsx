import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  Tags,
  Settings,
  Eye,
  EyeOff,
  LogOut,
  ChevronDown,
  Plus,
  Sparkles,
  Upload,
  PieChart,
  Scale,
  Wand2,
  ShieldCheck,
  TrendingUp,
  Package,
  Users,
  CalendarCheck,
  Hammer,
  Palette,
  GraduationCap,
  Flame,
} from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";
import { useIsSuperAdmin } from "@/hooks/use-super-admin";
import { TestingBanner } from "@/components/app/testing-banner";
import { useLabelOverrides, applyLabel } from "@/hooks/use-label-overrides";
import { useCustomizedUI, arrangeNav } from "@/hooks/use-customized-ui";

const baseNavDef = [
  { to: "/dashboard", icon: LayoutDashboard, key: "nav.dashboard", label: "Dashboard" },
  { to: "/transactions", icon: ArrowLeftRight, key: "nav.transactions", label: "Transações" },
  { to: "/accounts", icon: Wallet, key: "nav.accounts", label: "Contas" },
  { to: "/cards", icon: CreditCard, key: "nav.cards", label: "Cartões" },
  { to: "/budget-analysis", icon: PieChart, key: "nav.budget", label: "Análise de Orçamento" },
  { to: "/reconciliation", icon: Scale, key: "nav.reconciliation", label: "Conciliação" },
  { to: "/categories", icon: Tags, key: "nav.categories", label: "Categorias" },
  { to: "/import", icon: Upload, key: "nav.import", label: "Importar" },
  {
    to: "/atelier/cash-flow",
    icon: TrendingUp,
    key: "nav.atelier.cash_flow",
    label: "Fluxo de Caixa",
  },
  {
    to: "/atelier/raw-materials",
    icon: Package,
    key: "nav.atelier.raw_materials",
    label: "Matéria-prima",
  },
  {
    to: "/atelier/class-materials",
    icon: Users,
    key: "nav.atelier.class_materials",
    label: "Material Aulas",
  },
  {
    to: "/atelier/attendance",
    icon: CalendarCheck,
    key: "nav.atelier.attendance",
    label: "Presença",
  },
  { to: "/atelier/renovation", icon: Hammer, key: "nav.atelier.renovation", label: "Reforma" },
  {
    to: "/atelier/piece-pricing",
    icon: Palette,
    key: "nav.atelier.pieces",
    label: "Preço de Peças",
  },
  {
    to: "/atelier/workshop-pricing",
    icon: GraduationCap,
    key: "nav.atelier.workshops",
    label: "Workshops",
  },
  { to: "/atelier/firing-pricing", icon: Flame, key: "nav.atelier.firings", label: "Queimas" },
  { to: "/customizations", icon: Wand2, key: "nav.customizations", label: "Personalizações" },
  { to: "/settings", icon: Settings, key: "nav.settings", label: "Configurações" },
];

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { workspace, workspaces, switchTo, loading } = useCurrentWorkspace();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { data: labels } = useLabelOverrides(workspace?.id);
  const { hiddenNav, navOrder } = useCustomizedUI(workspace?.id);

  const baseNav = baseNavDef.map((n) => ({ ...n, label: applyLabel(labels, n.key, n.label) }));
  const navWithAdmin = isSuperAdmin
    ? [
        ...baseNav,
        {
          to: "/super-admin/customizations",
          icon: ShieldCheck,
          key: "nav.admin",
          label: applyLabel(labels, "nav.admin", "Aprovações (admin)"),
        },
      ]
    : baseNav;
  const nav = arrangeNav(navWithAdmin, navOrder, hiddenNav);

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
      .eq("id", workspace.id)
      .eq("owner_id", workspace.owner_id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["workspaces"] });
  }

  if (pathname === "/onboarding") return <Outlet />;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold text-lg">
            S
          </div>
          <div>
            <div className="font-display font-bold leading-tight text-base">Selá</div>
            <div className="text-xs text-sidebar-foreground/60">
              {workspace?.type === "business" ? "Cerâmica" : "Financeiro"}
            </div>
          </div>
        </div>

        {/* Workspace switcher */}
        <div className="px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 bg-sidebar-accent/40 hover:bg-sidebar-accent text-left transition">
                <div className="min-w-0">
                  <div className="text-xs text-sidebar-foreground/60 uppercase tracking-wide">
                    Workspace
                  </div>
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
                  <span className="text-xs text-muted-foreground ml-2">
                    {w.type === "personal" ? "Pessoal" : "Negócio"}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
                <Plus className="w-4 h-4 mr-2" />
                Novo workspace
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
            <p className="text-xs text-sidebar-foreground/60 mt-1">
              Em breve: peça mudanças no app em linguagem natural.
            </p>
          </div>
          <button
            onClick={togglePrivacy}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
          >
            {workspace?.privacy_mode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {workspace?.privacy_mode ? "Mostrar valores" : "Modo privacidade"}
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <header className="flex items-center justify-between px-4 py-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-display font-bold text-sm shrink-0">
                    S
                  </div>
                  <span className="font-display font-semibold truncate">
                    {workspace?.name ?? "Selá"}
                  </span>
                  <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>Seus workspaces</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
                    <span className="flex-1 truncate">{w.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {w.type === "personal" ? "Pessoal" : "Negócio"}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="w-4 h-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePrivacy}
              className="text-sidebar-foreground shrink-0"
            >
              {workspace?.privacy_mode ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
          </header>
          <nav
            className="flex gap-1 overflow-x-auto px-2 pb-2 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
          >
            {nav.map((item) => {
              const active = pathname === item.to || pathname.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition shrink-0 ${
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "bg-sidebar-accent/40 text-sidebar-foreground/80 hover:bg-sidebar-accent"
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="flex-1 min-w-0 overflow-auto">
          <TestingBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
