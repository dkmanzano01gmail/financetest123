import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "main_navigation";
const TOUR_VERSION = 1;

type TourStep = {
  key: string;
  title: string;
  description: string;
  to: string;
  target: string;
  atelierOnly?: boolean;
};

const allSteps: TourStep[] = [
  {
    key: "dashboard",
    title: "Comece pelo Dashboard",
    description:
      "Veja receitas, despesas, saldo e os principais indicadores do mês. Os filtros permitem consultar outros períodos.",
    to: "/dashboard",
    target: "nav.dashboard",
  },
  {
    key: "transactions",
    title: "Organize suas transações",
    description:
      "Consulte todos os lançamentos, corrija categorias e filtre por conta, cartão, tipo ou período.",
    to: "/transactions",
    target: "nav.transactions",
  },
  {
    key: "accounts-cards",
    title: "Cadastre contas e cartões",
    description:
      "Contas representam onde o dinheiro está. Cartões reúnem compras, faturas e pagamentos sem dupla contagem.",
    to: "/accounts",
    target: "nav.accounts",
  },
  {
    key: "import",
    title: "Importe seus arquivos",
    description:
      "Envie extratos e faturas em CSV, revise a prévia e confirme somente quando datas, valores e sinais estiverem corretos.",
    to: "/import",
    target: "nav.import",
  },
  {
    key: "reconciliation",
    title: "Confira com o banco",
    description:
      "A conciliação mostra se o saldo calculado pelo aplicativo corresponde ao saldo real da conta.",
    to: "/reconciliation",
    target: "nav.reconciliation",
  },
  {
    key: "cash-flow",
    title: "Planeje o fluxo de caixa",
    description:
      "Compare movimentações realizadas com receitas e despesas futuras para antecipar períodos de falta ou sobra de caixa.",
    to: "/atelier/cash-flow",
    target: "nav.atelier.cash_flow",
  },
  {
    key: "atelier",
    title: "Gerencie o ateliê",
    description:
      "Use esta área para alunos, presença, materiais, peças, workshops, fornos e custos de queima.",
    to: "/atelier/raw-materials",
    target: "atelier-section",
    atelierOnly: true,
  },
  {
    key: "help",
    title: "Ajuda sempre disponível",
    description:
      "Os ícones de informação explicam cada página. Use o botão Ajuda para refazer este tour quando quiser.",
    to: "/feedback",
    target: "help-button",
  },
];

type ProgressRow = {
  current_step: number;
  tour_version: number;
  completed_at: string | null;
  dismissed_at: string | null;
};

export function ProductTour({
  workspaceId,
  isAtelier,
  restartSignal,
  onTourStart,
}: {
  workspaceId: string;
  isAtelier: boolean;
  restartSignal: number;
  onTourStart: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const autoOpenedFor = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps = useMemo(
    () => allSteps.filter((step) => !step.atelierOnly || isAtelier),
    [isAtelier],
  );

  const progressQuery = useQuery({
    queryKey: ["product-tour", workspaceId, TOUR_KEY],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data, error } = await supabase
        .from("user_onboarding_progress")
        .select("current_step,tour_version,completed_at,dismissed_at")
        .eq("user_id", userData.user.id)
        .eq("workspace_id", workspaceId)
        .eq("tour_key", TOUR_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data as ProgressRow | null) ?? null;
    },
  });

  function start(index = 0) {
    onTourStart();
    setStepIndex(Math.min(Math.max(index, 0), steps.length - 1));
    setOpen(true);
  }

  useEffect(() => {
    if (!progressQuery.isFetched || autoOpenedFor.current === workspaceId) return;
    autoOpenedFor.current = workspaceId;
    const progress = progressQuery.data;
    const shouldOpen =
      !progress ||
      (progress.tour_version < TOUR_VERSION && !progress.dismissed_at) ||
      (!progress.completed_at && !progress.dismissed_at);
    if (shouldOpen) start(progress?.current_step ?? 0);
  }, [progressQuery.data, progressQuery.isFetched, workspaceId]);

  useEffect(() => {
    if (restartSignal > 0) start(0);
  }, [restartSignal]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void dismiss();
      if (event.key === "ArrowRight") void next();
      if (event.key === "ArrowLeft" && stepIndex > 0) setStepIndex((value) => value - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, stepIndex, steps.length]);

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    function updateTarget() {
      const step = steps[stepIndex];
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour-key="${step.target}"]`),
      );
      const target = candidates.find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!target) {
        setTargetRect(null);
        return;
      }
      target.scrollIntoView({ block: "nearest" });
      frame = window.requestAnimationFrame(() => setTargetRect(target.getBoundingClientRect()));
    }
    updateTarget();
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [open, stepIndex, steps]);

  async function saveProgress(values: {
    current_step: number;
    completed_at?: string | null;
    dismissed_at?: string | null;
  }) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase.from("user_onboarding_progress").upsert(
      {
        user_id: userData.user.id,
        workspace_id: workspaceId,
        tour_key: TOUR_KEY,
        tour_version: TOUR_VERSION,
        current_step: values.current_step,
        completed_at: values.completed_at ?? null,
        dismissed_at: values.dismissed_at ?? null,
      },
      { onConflict: "user_id,workspace_id,tour_key" },
    );
    await queryClient.invalidateQueries({ queryKey: ["product-tour", workspaceId, TOUR_KEY] });
  }

  async function dismiss() {
    setOpen(false);
    await saveProgress({ current_step: stepIndex, dismissed_at: new Date().toISOString() });
  }

  async function next() {
    if (stepIndex >= steps.length - 1) {
      setOpen(false);
      await saveProgress({
        current_step: steps.length - 1,
        completed_at: new Date().toISOString(),
      });
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    await saveProgress({ current_step: nextIndex });
  }

  if (!open || !steps.length) return null;

  const step = steps[stepIndex];
  const cardStyle = targetRect
    ? {
        left: Math.max(16, Math.min(targetRect.right + 18, window.innerWidth - 380)),
        top: Math.min(Math.max(targetRect.top, 16), window.innerHeight - 330),
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Tour do Selá Finance">
      {targetRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(26,13,18,0.72)] transition-all duration-200"
          style={{
            left: targetRect.left - 5,
            top: targetRect.top - 5,
            width: targetRect.width + 10,
            height: targetRect.height + 10,
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-sela-plum/75" aria-hidden="true" />
      )}

      <section
        className={`fixed w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl ${
          targetRect ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={cardStyle}
      >
        <button
          type="button"
          onClick={() => void dismiss()}
          className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Fechar apresentação"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-4 w-4 text-accent" />
          Conheça o Selá Finance
        </div>
        <div className="mt-4 font-display text-xl font-bold">{step.title}</div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>

        <button
          type="button"
          onClick={() => navigate({ to: step.to as never })}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          Abrir esta área <ExternalLink className="h-3.5 w-3.5" />
        </button>

        <div className="mt-5 flex gap-1.5" aria-label={`Etapa ${stepIndex + 1} de ${steps.length}`}>
          {steps.map((item, index) => (
            <span
              key={item.key}
              className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-accent" : "bg-muted"}`}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => void dismiss()}>
            Pular tour
          </Button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStepIndex((value) => value - 1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
            )}
            <Button size="sm" onClick={() => void next()}>
              {stepIndex === steps.length - 1 ? "Concluir" : "Próximo"}
              {stepIndex < steps.length - 1 && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
