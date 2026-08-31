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
  UserRound,
  MessageSquare,
  Gauge,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  CircleHelp,
  Loader2,
  CircleDollarSign,
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
import { useEffect, useState } from "react";
import { useIsSuperAdmin } from "@/hooks/use-super-admin";
import { TestingBanner } from "@/components/app/testing-banner";
import { useLabelOverrides, applyLabel } from "@/hooks/use-label-overrides";
import { useCustomizedUI, arrangeNav } from "@/hooks/use-customized-ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ProductTour } from "@/components/app/product-tour";
import { QuickFeedbackButton } from "@/components/app/quick-feedback-button";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { StudentPortalShell } from "@/components/app/student-portal-shell";

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
    to: "/atelier/student-payments",
    icon: CircleDollarSign,
    key: "nav.atelier.student_payments",
    label: "Pagamentos de alunos",
  },
  {
    to: "/atelier/attendance",
    icon: CalendarCheck,
    key: "nav.atelier.attendance",
    label: "Lista de presença",
  },
  {
    to: "/atelier/students",
    icon: UserRound,
    key: "nav.atelier.students",
    label: "Alunos",
  },
  {
    to: "/atelier/kilns",
    icon: Gauge,
    key: "nav.atelier.kilns",
    label: "Fornos",
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
  { to: "/feedback", icon: MessageSquare, key: "nav.feedback", label: "Comentários" },
  { to: "/customizations", icon: Wand2, key: "nav.customizations", label: "Personalizações" },
  { to: "/settings", icon: Settings, key: "nav.settings", label: "Configurações" },
];

const financialNavKeys = new Set([
  "nav.dashboard",
  "nav.transactions",
  "nav.accounts",
  "nav.cards",
  "nav.budget",
  "nav.reconciliation",
  "nav.categories",
  "nav.import",
  "nav.atelier.cash_flow",
]);

const atelierNavKeys = new Set([
  "nav.atelier.raw_materials",
  "nav.atelier.class_materials",
  "nav.atelier.student_payments",
  "nav.atelier.attendance",
  "nav.atelier.students",
  "nav.atelier.kilns",
  "nav.atelier.renovation",
  "nav.atelier.pieces",
  "nav.atelier.workshops",
  "nav.atelier.firings",
]);

export function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { workspace, workspaces, switchTo, loading } = useCurrentWorkspace();
  const { data: isSuperAdmin } = useIsSuperAdmin();
  const { data: labels } = useLabelOverrides(workspace?.id);
  const { hiddenNav, navOrder } = useCustomizedUI(workspace?.id);
  const { data: studentPortal, isLoading: studentPortalLoading } = useStudentPortalAccess();
  const isAtelierWorkspace = workspace?.is_atelier === true;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" && window.localStorage.getItem("sela-sidebar") === "compact",
  );
  const [atelierExpanded, setAtelierExpanded] = useState(
    () =>
      typeof window === "undefined" || window.localStorage.getItem("sela-atelier-nav") !== "closed",
  );
  const [tourRestartSignal, setTourRestartSignal] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
  const financialNav = nav.filter((item) => financialNavKeys.has(item.key));
  const atelierNav = isAtelierWorkspace
    ? nav.filter((item) => atelierNavKeys.has(item.key))
    : [];
  const systemNav = nav.filter(
    (item) => !financialNavKeys.has(item.key) && !atelierNavKeys.has(item.key),
  );

  useEffect(() => {
    window.localStorage.setItem("sela-sidebar", sidebarCollapsed ? "compact" : "open");
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem("sela-atelier-nav", atelierExpanded ? "open" : "closed");
  }, [atelierExpanded]);

  useEffect(() => {
    if (
      !loading &&
      workspace &&
      !isAtelierWorkspace &&
      pathname.startsWith("/atelier/") &&
      !pathname.startsWith("/atelier/cash-flow")
    ) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [isAtelierWorkspace, loading, navigate, pathname, workspace]);

  // Redirect to onboarding if no workspace
  useEffect(() => {
    if (
      !loading &&
      !studentPortalLoading &&
      !studentPortal &&
      workspaces.length === 0 &&
      pathname !== "/onboarding"
    ) {
      navigate({ to: "/onboarding" });
    }
  }, [loading, navigate, pathname, studentPortal, studentPortalLoading, workspaces.length]);

  useEffect(() => {
    if (studentPortal && !pathname.startsWith("/student")) {
      navigate({ to: "/student", replace: true });
    }
  }, [navigate, pathname, studentPortal]);

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setIsSigningOut(false);
      toast.error(`Não foi possível sair: ${error.message}`);
      return;
    }

    await qc.cancelQueries();
    qc.clear();
    window.location.replace(new URL("/auth", window.location.origin).toString());
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

  function desktopNavLink(item: (typeof nav)[number]) {
    const active = pathname === item.to || pathname.startsWith(item.to + "/");
    return (
      <Tooltip key={item.to}>
        <TooltipTrigger asChild>
          <Link
            to={item.to}
            data-tour-key={item.key}
            aria-label={item.label}
            className={`flex h-10 items-center rounded-lg text-sm transition ${
              sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
            } ${
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.key === "nav.budget" && (
                  <span className="rounded-full border border-sidebar-primary/50 bg-sidebar-primary/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
                    WIP
                  </span>
                )}
              </>
            )}
          </Link>
        </TooltipTrigger>
        {sidebarCollapsed && (
          <TooltipContent side="right">
            {item.label}{item.key === "nav.budget" ? " · WIP" : ""}
          </TooltipContent>
        )}
      </Tooltip>
    );
  }

  function mobileNavLink(item: (typeof nav)[number]) {
    const active = pathname === item.to || pathname.startsWith(item.to + "/");
    return (
      <SheetClose asChild key={item.to}>
        <Link
          to={item.to}
          data-tour-key={item.key}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{item.label}</span>
          {item.key === "nav.budget" && (
            <span className="rounded-full border border-sidebar-primary/50 bg-sidebar-primary/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider">
              WIP
            </span>
          )}
        </Link>
      </SheetClose>
    );
  }

  if (studentPortalLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (studentPortal) return <StudentPortalShell access={studentPortal} />;
  if (pathname === "/onboarding") return <Outlet />;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <TooltipProvider delayDuration={150}>
        <aside
          className={`relative hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:sticky md:top-0 md:flex ${
            sidebarCollapsed ? "w-[4.5rem]" : "w-64"
          }`}
        >
          <button
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="absolute -right-3 top-6 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-md transition hover:bg-sidebar-accent"
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>

          <div
            className={`flex items-center py-5 ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-5"}`}
          >
            <img
              src="/sela-finance-logo-light.png"
              alt="Selá Finance"
              className={`shrink-0 object-contain ${sidebarCollapsed ? "h-10 w-14" : "h-14 w-28"}`}
            />
            {!sidebarCollapsed && (
              <div>
                <span className="rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-sidebar-primary-foreground">
                  Beta
                </span>
                <div className="text-xs text-sidebar-foreground/60">
                  Pessoal e negócios
                </div>
              </div>
            )}
          </div>

          <div className={sidebarCollapsed ? "px-3" : "px-3"}>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Selecionar workspace"
                      className={`flex w-full items-center rounded-lg bg-sidebar-accent/40 transition hover:bg-sidebar-accent ${
                        sidebarCollapsed
                          ? "h-10 justify-center px-0"
                          : "justify-between gap-2 px-3 py-2.5 text-left"
                      }`}
                    >
                      {sidebarCollapsed ? (
                        <span className="font-display text-sm font-bold uppercase">
                          {(workspace?.name ?? "S").slice(0, 1)}
                        </span>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-wide text-sidebar-foreground/60">
                              Workspace
                            </div>
                            <div className="truncate font-medium">{workspace?.name ?? "—"}</div>
                          </div>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                        </>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                {sidebarCollapsed && (
                  <TooltipContent side="right">{workspace?.name ?? "Workspace"}</TooltipContent>
                )}
              </Tooltip>
              <DropdownMenuContent className="w-60">
                <DropdownMenuLabel>Seus workspaces</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
                    <span className="flex-1 truncate">{w.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {w.is_atelier ? "Ateliê" : w.type === "personal" ? "Pessoal" : "Negócio"}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {!sidebarCollapsed && (
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                Financeiro
              </div>
            )}
            <div className="space-y-0.5">{financialNav.map(desktopNavLink)}</div>

            {isAtelierWorkspace && (
              <>
                <div className="my-3 border-t border-sidebar-border/70" />
                {!sidebarCollapsed && (
                  <button
                    onClick={() => setAtelierExpanded((value) => !value)}
                    data-tour-key="atelier-section"
                    className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    Ateliê
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform ${atelierExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                )}
                {atelierExpanded && (
                  <div className="space-y-0.5">{atelierNav.map(desktopNavLink)}</div>
                )}
              </>
            )}

            {systemNav.length > 0 && (
              <>
                <div className="my-3 border-t border-sidebar-border/70" />
                {!sidebarCollapsed && (
                  <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    Mais
                  </div>
                )}
                <div className="space-y-0.5">{systemNav.map(desktopNavLink)}</div>
              </>
            )}
          </nav>

          <div className="space-y-1 border-t border-sidebar-border p-3">
            {!sidebarCollapsed && (
              <div className="mb-2 rounded-lg bg-sidebar-accent/40 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-sidebar-primary" />
                  <span className="font-medium">Personalizações</span>
                </div>
                <p className="mt-1 text-xs text-sidebar-foreground/60">
                  Peça mudanças no app em linguagem natural, só para você ou para o workspace.
                </p>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setTourRestartSignal((value) => value + 1)}
                  data-tour-key="help-button"
                  aria-label="Ajuda e apresentação"
                  className={`flex h-10 w-full items-center rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent ${
                    sidebarCollapsed ? "justify-center" : "gap-3 px-3"
                  }`}
                >
                  <CircleHelp className="h-4 w-4" />
                  {!sidebarCollapsed && "Ajuda e apresentação"}
                </button>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">Ajuda e apresentação</TooltipContent>}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={togglePrivacy}
                  aria-label={workspace?.privacy_mode ? "Mostrar valores" : "Modo privacidade"}
                  className={`flex h-10 w-full items-center rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent ${
                    sidebarCollapsed ? "justify-center" : "gap-3 px-3"
                  }`}
                >
                  {workspace?.privacy_mode ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {!sidebarCollapsed &&
                    (workspace?.privacy_mode ? "Mostrar valores" : "Modo privacidade")}
                </button>
              </TooltipTrigger>
              {sidebarCollapsed && (
                <TooltipContent side="right">
                  {workspace?.privacy_mode ? "Mostrar valores" : "Modo privacidade"}
                </TooltipContent>
              )}
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  disabled={isSigningOut}
                  aria-label="Sair"
                  className={`flex h-10 w-full items-center rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent disabled:cursor-wait disabled:opacity-60 ${
                    sidebarCollapsed ? "justify-center" : "gap-3 px-3"
                  }`}
                >
                  {isSigningOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  {!sidebarCollapsed && (isSigningOut ? "Saindo…" : "Sair")}
                </button>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">Sair</TooltipContent>}
            </Tooltip>
          </div>
        </aside>
      </TooltipProvider>

      {/* Mobile top bar */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <header className="flex items-center justify-between px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-sidebar-foreground"
                    aria-label="Abrir menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="flex w-[19rem] flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
                >
                  <SheetHeader className="border-b border-sidebar-border px-5 py-5 text-left">
                    <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
                      <img
                        src="/sela-finance-logo-light.png"
                        alt="Selá Finance"
                        className="h-14 w-24 shrink-0 object-contain"
                      />
                      <span>
                        <span className="inline-flex rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-sidebar-primary-foreground">
                          Beta
                        </span>
                        <span className="block text-xs font-normal text-sidebar-foreground/60">
                          Pessoal e negócios
                        </span>
                      </span>
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="flex-1 overflow-y-auto px-3 py-4">
                    <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                      Financeiro
                    </div>
                    <div className="space-y-0.5">{financialNav.map(mobileNavLink)}</div>
                    {isAtelierWorkspace && (
                      <>
                        <div className="my-3 border-t border-sidebar-border/70" />
                        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                          Ateliê
                        </div>
                        <div className="space-y-0.5">{atelierNav.map(mobileNavLink)}</div>
                      </>
                    )}
                    {systemNav.length > 0 && (
                      <>
                        <div className="my-3 border-t border-sidebar-border/70" />
                        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                          Mais
                        </div>
                        <div className="space-y-0.5">{systemNav.map(mobileNavLink)}</div>
                      </>
                    )}
                  </nav>
                  <div className="space-y-1 border-t border-sidebar-border p-3">
                    <button
                      type="button"
                      onClick={() => setTourRestartSignal((value) => value + 1)}
                      data-tour-key="help-button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    >
                      <CircleHelp className="h-4 w-4" /> Ajuda e apresentação
                    </button>
                    <button
                      onClick={togglePrivacy}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    >
                      {workspace?.privacy_mode ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {workspace?.privacy_mode ? "Mostrar valores" : "Modo privacidade"}
                    </button>
                    <button
                      onClick={signOut}
                      disabled={isSigningOut}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent disabled:cursor-wait disabled:opacity-60"
                    >
                      {isSigningOut ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="h-4 w-4" />
                      )}
                      {isSigningOut ? "Saindo…" : "Sair"}
                    </button>
                  </div>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground">
                      S
                    </div>
                    <span className="truncate font-display font-semibold">
                      {workspace?.name ?? "Selá"}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel>Seus workspaces</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {workspaces.map((w) => (
                    <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
                      <span className="flex-1 truncate">{w.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {w.is_atelier ? "Ateliê" : w.type === "personal" ? "Pessoal" : "Negócio"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/onboarding" })}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTourRestartSignal((value) => value + 1)}
                data-tour-key="help-button"
                className="shrink-0 text-sidebar-foreground"
                aria-label="Ajuda e apresentação"
              >
                <CircleHelp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePrivacy}
                className="shrink-0 text-sidebar-foreground"
                aria-label={workspace?.privacy_mode ? "Mostrar valores" : "Ocultar valores"}
              >
                {workspace?.privacy_mode ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </header>
        </div>

        <main className="flex-1 min-w-0 overflow-auto">
          <TestingBanner />
          <Outlet />
        </main>
      </div>
      {workspace && (
        <>
          <QuickFeedbackButton
            workspaceId={workspace.id}
            pathname={pathname}
          />
          <ProductTour
            workspaceId={workspace.id}
            isAtelier={isAtelierWorkspace}
            restartSignal={tourRestartSignal}
            onTourStart={() => {
              setSidebarCollapsed(false);
              if (isAtelierWorkspace) setAtelierExpanded(true);
            }}
          />
        </>
      )}
    </div>
  );
}
