import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { L } from "@/lib/labels";
import { PieChart, TrendingDown, Sparkles, Repeat, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/budget-analysis")({
  component: BudgetAnalysisPage,
});

type Importance = "essential" | "important" | "flexible" | "superfluous";
const importanceLabel: Record<Importance, string> = {
  essential: "Essencial",
  important: "Importante",
  flexible: "Flexível",
  superfluous: "Supérfluo",
};
const importanceColor: Record<Importance, string> = {
  essential: "bg-emerald-100 text-emerald-800",
  important: "bg-sky-100 text-sky-800",
  flexible: "bg-amber-100 text-amber-800",
  superfluous: "bg-rose-100 text-rose-800",
};

function BudgetAnalysisPage() {
  const { workspace } = useCurrentWorkspace();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const labels = L(workspace?.type ?? "personal");

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const fromISO = from.toISOString().slice(0, 10);

  const { data: txs, isLoading } = useQuery({
    queryKey: ["ba-txs", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id,date,description,amount,type,status,category_id,credit_card_id,account_id,importance_level",
        )
        .eq("workspace_id", wsId!)
        .gte("date", fromISO)
        .neq("status", "ignored");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["ba-cats", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,type,importance_level" as any)
        .eq("workspace_id", wsId!);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const analysis = useMemo(() => {
    if (!txs || !categories) return null;
    const catMap = new Map<string, { name: string; importance: Importance }>();
    categories.forEach((c: any) =>
      catMap.set(c.id, {
        name: c.name,
        importance: (c.importance_level ?? "flexible") as Importance,
      }),
    );
    const now = new Date();
    const monthKey = (d: string) => d.slice(0, 7);
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const expenses = txs.filter((t) => t.type === "expense");
    const monthExpenses = expenses.filter((t) => monthKey(t.date) === currentMonth);

    let totalMonth = 0;
    const byImportance: Record<Importance, number> = {
      essential: 0,
      important: 0,
      flexible: 0,
      superfluous: 0,
    };
    const byCategory = new Map<
      string,
      { name: string; importance: Importance; monthAmount: number; count: number; total6m: number }
    >();

    for (const t of monthExpenses) {
      const amt = Math.abs(Number(t.amount));
      totalMonth += amt;
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const imp = (((t as any).importance_level as Importance | null) ??
        cat?.importance ??
        "flexible") as Importance;
      byImportance[imp] += amt;
    }
    for (const t of expenses) {
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const key = t.category_id ?? "uncategorized";
      const txImp =
        ((t as any).importance_level as Importance | null) ?? cat?.importance ?? "flexible";
      const cur = byCategory.get(key) ?? {
        name: cat?.name ?? "Sem categoria",
        importance: txImp as Importance,
        monthAmount: 0,
        count: 0,
        total6m: 0,
      };
      const amt = Math.abs(Number(t.amount));
      cur.total6m += amt;
      if (monthKey(t.date) === currentMonth) {
        cur.monthAmount += amt;
        cur.count += 1;
      }
      byCategory.set(key, cur);
    }

    // Hidden expenses: recurring small/medium charges by similar description
    const descGroups = new Map<
      string,
      { sample: string; total: number; count: number; categoryName: string }
    >();
    for (const t of expenses) {
      const key = normalizeDesc(t.description);
      if (!key) continue;
      const cat = t.category_id ? catMap.get(t.category_id) : null;
      const cur = descGroups.get(key) ?? {
        sample: t.description,
        total: 0,
        count: 0,
        categoryName: cat?.name ?? "Sem categoria",
      };
      cur.total += Math.abs(Number(t.amount));
      cur.count += 1;
      descGroups.set(key, cur);
    }
    const hidden = Array.from(descGroups.values())
      .filter((g) => g.count >= 3 && g.total / g.count <= 100)
      .map((g) => ({ ...g, monthly: g.total / 6 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    // Cut opportunity ranking
    const ranking = Array.from(byCategory.values())
      .filter((c) => c.monthAmount > 0 && c.importance !== "essential")
      .map((c) => ({
        ...c,
        score:
          c.monthAmount * 0.3 +
          (c.importance === "superfluous" ? 1000 : c.importance === "flexible" ? 500 : 0) +
          c.count * 5,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const insights: { title: string; description: string; monthly: number }[] = [];
    const sortedCats = Array.from(byCategory.values()).sort(
      (a, b) => b.monthAmount - a.monthAmount,
    );
    if (sortedCats[0]) {
      insights.push({
        title: `${sortedCats[0].name} é seu maior gasto do mês`,
        description: `Representa ${((sortedCats[0].monthAmount / Math.max(totalMonth, 1)) * 100).toFixed(0)}% dos gastos.`,
        monthly: sortedCats[0].monthAmount,
      });
    }
    if (hidden.length > 0) {
      const totalHidden = hidden.reduce((s, h) => s + h.monthly, 0);
      insights.push({
        title: `${hidden.length} gastos escondidos somam ${formatCurrency(totalHidden, currency, privacy)} por mês`,
        description: "Pequenos lançamentos repetidos podem virar uma economia relevante.",
        monthly: totalHidden,
      });
    }
    if (byImportance.superfluous > 0) {
      insights.push({
        title: "Gastos supérfluos identificados",
        description: `Cortando 100% dessa categoria você liberaria ${formatCurrency(byImportance.superfluous, currency, privacy)} por mês.`,
        monthly: byImportance.superfluous,
      });
    }

    return { totalMonth, byImportance, byCategory: sortedCats, hidden, ranking, insights };
  }, [txs, categories, currency, privacy]);

  if (isLoading || !analysis) {
    return (
      <PageContainer>
        <PageHeader title="Análise de Orçamento" description="Carregando análise…" />
      </PageContainer>
    );
  }

  if ((txs?.length ?? 0) === 0) {
    return (
      <PageContainer>
        <PageHeader title="Análise de Orçamento" description="Insights sobre seus gastos" />
        <EmptyState
          icon={PieChart}
          title="Sem dados suficientes"
          description="Importe ou cadastre transações para descobrir gastos escondidos e oportunidades de economia."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Análise de Orçamento"
        description="Descubra para onde vai seu dinheiro e quanto pode economizar"
      />

      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label={`${labels.expense} do mês`}
          value={analysis.totalMonth}
          currency={currency}
          privacy={privacy}
        />
        <StatCard
          label="Essenciais"
          value={analysis.byImportance.essential}
          currency={currency}
          privacy={privacy}
          tone="emerald"
        />
        <StatCard
          label="Flexíveis"
          value={analysis.byImportance.flexible}
          currency={currency}
          privacy={privacy}
          tone="amber"
        />
        <StatCard
          label="Supérfluos"
          value={analysis.byImportance.superfluous}
          currency={currency}
          privacy={privacy}
          tone="rose"
        />
      </div>

      {/* Insights inteligentes */}
      {analysis.insights.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" /> Sugestões inteligentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.insights.map((i, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                <div className="flex-1">
                  <div className="font-medium text-sm">{i.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{i.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">em 1 ano</div>
                  <div className="font-display font-semibold">
                    {formatCurrency(i.monthly * 12, currency, privacy)}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="hidden" className="mb-6">
        <TabsList>
          <TabsTrigger value="hidden">Gastos escondidos</TabsTrigger>
          <TabsTrigger value="ranking">Atacar primeiro</TabsTrigger>
          <TabsTrigger value="simulator">Simulador</TabsTrigger>
        </TabsList>

        <TabsContent value="hidden">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Repeat className="w-4 h-4" /> Gastos escondidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.hidden.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum padrão de gasto recorrente pequeno detectado nos últimos 6 meses.
                </div>
              ) : (
                <div className="space-y-2">
                  {analysis.hidden.map((h, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{h.sample}</div>
                        <div className="text-xs text-muted-foreground">
                          {h.categoryName} · {h.count}× em 6 meses
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs text-muted-foreground">
                          ~{formatCurrency(h.monthly, currency, privacy)}/mês
                        </div>
                        <div className="font-medium text-sm">
                          {formatCurrency(h.monthly * 12, currency, privacy)} em 1 ano
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ranking">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingDown className="w-4 h-4" /> Categorias para atacar primeiro
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.ranking.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Nenhuma categoria com oportunidade clara de corte.
                </div>
              ) : (
                <div className="space-y-2">
                  {analysis.ranking.map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{r.name}</span>
                          <Badge variant="secondary" className={importanceColor[r.importance]}>
                            {importanceLabel[r.importance]}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {r.count} transações este mês
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(r.monthAmount, currency, privacy)}/mês
                        </div>
                        <div className="font-medium text-sm">
                          Economia potencial 30%:{" "}
                          {formatCurrency(r.monthAmount * 0.3 * 6, currency, privacy)} em 6m
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulator">
          <Simulator byImportance={analysis.byImportance} currency={currency} privacy={privacy} />
        </TabsContent>
      </Tabs>

      {/* Aviso dupla contagem */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/40">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Para análise de consumo usamos os lançamentos detalhados do cartão (quando existirem) e os
          pagamentos de fatura aparecem apenas no fluxo da conta corrente, evitando dupla contagem.
        </span>
      </div>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  currency,
  privacy,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  privacy: boolean;
  tone?: "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`font-display text-xl md:text-2xl font-semibold mt-1 ${toneClass}`}>
          {formatCurrency(value, currency, privacy)}
        </div>
      </CardContent>
    </Card>
  );
}

function Simulator({
  byImportance,
  currency,
  privacy,
}: {
  byImportance: Record<Importance, number>;
  currency: string;
  privacy: boolean;
}) {
  const [preset, setPreset] = useState<"conservative" | "moderate" | "aggressive" | "custom">(
    "moderate",
  );
  const presets = {
    conservative: { essential: 0, important: 0, flexible: 10, superfluous: 30 },
    moderate: { essential: 0, important: 5, flexible: 20, superfluous: 50 },
    aggressive: { essential: 0, important: 10, flexible: 40, superfluous: 100 },
    custom: { essential: 0, important: 0, flexible: 0, superfluous: 0 },
  };
  const [custom, setCustom] = useState(presets.custom);
  const cuts = preset === "custom" ? custom : presets[preset];

  const monthlySavings =
    byImportance.essential * (cuts.essential / 100) +
    byImportance.important * (cuts.important / 100) +
    byImportance.flexible * (cuts.flexible / 100) +
    byImportance.superfluous * (cuts.superfluous / 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Simulador de corte de gastos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {(["conservative", "moderate", "aggressive", "custom"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={preset === p ? "default" : "outline"}
              onClick={() => setPreset(p)}
            >
              {p === "conservative"
                ? "Conservador"
                : p === "moderate"
                  ? "Moderado"
                  : p === "aggressive"
                    ? "Agressivo"
                    : "Personalizado"}
            </Button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {(["superfluous", "flexible", "important", "essential"] as Importance[]).map((imp) => (
            <div key={imp} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  <Badge variant="secondary" className={importanceColor[imp]}>
                    {importanceLabel[imp]}
                  </Badge>
                </span>
                <span className="text-muted-foreground">{cuts[imp]}% de corte</span>
              </div>
              <Slider
                value={[cuts[imp]]}
                max={100}
                step={5}
                disabled={preset !== "custom" || imp === "essential"}
                onValueChange={(v) => setCustom({ ...custom, [imp]: v[0] })}
              />
              <div className="text-xs text-muted-foreground">
                Gasto atual: {formatCurrency(byImportance[imp], currency, privacy)}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t">
          <SavingStat
            label="Economia mensal"
            value={monthlySavings}
            currency={currency}
            privacy={privacy}
          />
          <SavingStat
            label="Em 3 meses"
            value={monthlySavings * 3}
            currency={currency}
            privacy={privacy}
          />
          <SavingStat
            label="Em 6 meses"
            value={monthlySavings * 6}
            currency={currency}
            privacy={privacy}
          />
          <SavingStat
            label="Em 1 ano"
            value={monthlySavings * 12}
            currency={currency}
            privacy={privacy}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SavingStat({
  label,
  value,
  currency,
  privacy,
}: {
  label: string;
  value: number;
  currency: string;
  privacy: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display font-semibold text-emerald-700">
        {formatCurrency(value, currency, privacy)}
      </div>
    </div>
  );
}

function normalizeDesc(d: string): string {
  return d
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 3)
    .join(" ")
    .trim();
}
