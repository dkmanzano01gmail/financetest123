import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Package,
  Lightbulb,
  CalendarCheck,
  WalletCards,
  UserRound,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { StudentPortalAccess } from "@/hooks/use-student-portal";

const nav = [
  { to: "/student", label: "Início", icon: Home },
  { to: "/student/pieces", label: "Minhas peças", icon: Package },
  { to: "/student/projects", label: "Meus projetos", icon: Lightbulb },
  { to: "/student/classes", label: "Minhas aulas", icon: CalendarCheck },
  { to: "/student/payments", label: "Pagamentos", icon: WalletCards },
  { to: "/student/account", label: "Minha conta", icon: UserRound },
] as const;

export function StudentPortalShell({ access }: { access: StudentPortalAccess }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/auth");
  }
  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div className="px-6 py-6">
          <img
            src="/sela-finance-logo-light.png"
            alt="Selá Finance"
            className="h-16 w-28 object-contain"
          />
          <div className="mt-2 text-xs text-sidebar-foreground/60">Portal do aluno</div>
          <div className="truncate text-sm font-medium">{access.workspace_name}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent"}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={signOut}
          className="m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>
      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div>
            <div className="font-display font-semibold">Portal do aluno</div>
            <div className="text-xs text-muted-foreground">{access.workspace_name}</div>
          </div>
          <button onClick={signOut} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </button>
        </header>
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t bg-background md:hidden">
        {nav.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">
                {item.label.replace("Minhas ", "").replace("Meus ", "")}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
