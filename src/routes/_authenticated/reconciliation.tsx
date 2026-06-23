import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { Scale, Wallet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reconciliation")({ component: ReconciliationPage });

function ReconciliationPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [selected, setSelected] = useState<string>("__all__");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [initialBalance, setInitialBalance] = useState("");
  const [initialDate, setInitialDate] = useState("");
  const [reported, setReported] = useState("");
  const [reportedDate, setReportedDate] = useState("");
  const [tolerance, setTolerance] = useState("1");

  const { data: accounts } = useQuery({
    queryKey: ["recon-accounts", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("workspace_id", wsId!)
        .eq("is_active", true)
        .in("type", ["checking", "savings", "cash"])
        .order("created_at");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: txs } = useQuery({
    queryKey: ["recon-txs", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,date,description,amount,type,status,category_id,account_id")
        .eq("workspace_id", wsId!)
        .not("account_id", "is", null)
        .neq("status", "ignored")
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });

  function openEdit(a: any) {
    setEditing(a);
    setInitialBalance(String(a.initial_balance ?? ""));
    setInitialDate(a.initial_balance_date ?? "");
    setReported(a.current_manual_balance != null ? String(a.current_manual_balance) : "");
    setReportedDate(a.current_manual_balance_date ?? new Date().toISOString().slice(0, 10));
    setTolerance("1");
    setEditOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const initBal = Number(initialBalance.replace(",", ".") || 0);
      const repBal = reported === "" ? null : Number(reported.replace(",", "."));
      const { error } = await supabase
        .from("accounts")
        .update({
          initial_balance: initBal,
          initial_balance_date: initialDate || new Date().toISOString().slice(0, 10),
          current_manual_balance: repBal as any,
          current_manual_balance_date: (repBal != null ? reportedDate : null) as any,
        } as any)
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recon-accounts"] });
      qc.invalidateQueries({ queryKey: ["accounts-full"] });
      toast.success("Saldo atualizado");
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const computed = useMemo(() => {
    if (!accounts || !txs) return [];
    return accounts.map((a) => {
      const accTxs = txs.filter((t) => t.account_id === a.id && (!a.initial_balance_date || t.date >= a.initial_balance_date));
      let income = 0, expense = 0;
      for (const t of accTxs) {
        const amt = Math.abs(Number(t.amount));
        if (t.type === "income") income += amt; else expense += amt;
      }
      const calculated = Number(a.initial_balance ?? 0) + income - expense;
      const reportedVal = a.current_manual_balance != null ? Number(a.current_manual_balance) : null;
      const tol = Number(a.tolerance ?? 1);
      const diff = reportedVal != null ? reportedVal - calculated : 0;
      let status: "reconciled" | "small_diff" | "relevant_diff" | "no_balance" = "no_balance";
      if (reportedVal != null) {
        if (Math.abs(diff) === 0) status = "reconciled";
        else if (Math.abs(diff) <= tol) status = "small_diff";
        else status = "relevant_diff";
      }
      return { account: a, income, expense, calculated, reported: reportedVal, diff, status, txs: accTxs };
    });
  }, [accounts, txs]);

  const selectedRow = selected !== "__all__" ? computed.find((c) => c.account.id === selected) : null;

  const dailySeries = useMemo(() => {
    if (!selectedRow) return [];
    const sorted = [...selectedRow.txs].sort((a, b) => a.date.localeCompare(b.date));
    const byDay = new Map<string, { date: string; in: number; out: number }>();
    for (const t of sorted) {
      const cur = byDay.get(t.date) ?? { date: t.date, in: 0, out: 0 };
      const amt = Math.abs(Number(t.amount));
      if (t.type === "income") cur.in += amt; else cur.out += amt;
      byDay.set(t.date, cur);
    }
    let bal = Number(selectedRow.account.initial_balance ?? 0);
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
      bal = bal + d.in - d.out;
      return { date: d.date, saldo: Number(bal.toFixed(2)) };
    });
  }, [selectedRow]);

  if (!accounts) {
    return <PageContainer><PageHeader title="Conciliação de Conta" description="Carregando…" /></PageContainer>;
  }

  if (accounts.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Conciliação de Conta" description="Compare o saldo calculado com o saldo real do banco" />
        <EmptyState icon={Wallet} title="Nenhuma conta cadastrada" description="Cadastre uma conta corrente para começar a conciliar." />
      </PageContainer>
    );
  }

  // Consolidated cards
  const totalCalc = computed.reduce((s, c) => s + c.calculated, 0);
  const totalReported = computed.reduce((s, c) => s + (c.reported ?? 0), 0);
  const totalDiff = computed.reduce((s, c) => s + (c.reported != null ? c.diff : 0), 0);
  const reconciledCount = computed.filter((c) => c.status === "reconciled" || c.status === "small_diff").length;
  const diffCount = computed.filter((c) => c.status === "relevant_diff").length;

  return (
    <PageContainer>
      <PageHeader title="Conciliação de Conta" description="Verifique se o saldo calculado bate com o saldo real" />

      <div className="flex flex-wrap gap-3 mb-5">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as contas</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected === "__all__" ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Saldo calculado" value={totalCalc} currency={currency} privacy={privacy} />
            <Stat label="Saldo informado" value={totalReported} currency={currency} privacy={privacy} />
            <Stat label="Diferença total" value={totalDiff} currency={currency} privacy={privacy} tone={Math.abs(totalDiff) > 1 ? "rose" : "emerald"} />
            <Stat label="Contas conciliadas" raw={`${reconciledCount}/${computed.length}`} />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Visão consolidada</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Calculado</TableHead>
                    <TableHead className="text-right">Informado</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {computed.map((c) => (
                    <TableRow key={c.account.id}>
                      <TableCell>
                        <div className="font-medium">{c.account.name}</div>
                        <div className="text-xs text-muted-foreground">{c.account.institution ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(c.calculated, currency, privacy)}</TableCell>
                      <TableCell className="text-right">{c.reported != null ? formatCurrency(c.reported, currency, privacy) : "—"}</TableCell>
                      <TableCell className="text-right">{c.reported != null ? formatCurrency(c.diff, currency, privacy) : "—"}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => { setSelected(c.account.id); }}>Abrir</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {diffCount > 0 && (
            <div className="mt-4 flex items-start gap-2 text-sm p-3 rounded-lg bg-rose-50 text-rose-900">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{diffCount} conta(s) com diferença relevante. Abra a conta para investigar.</span>
            </div>
          )}
        </>
      ) : selectedRow ? (
        <AccountDetail
          row={selectedRow}
          currency={currency}
          privacy={privacy}
          dailySeries={dailySeries}
          onEdit={() => openEdit(selectedRow.account)}
        />
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Saldo da conta — {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Saldo inicial</Label><Input value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0,00" /></div>
              <div className="space-y-1.5"><Label>Data do saldo inicial</Label><Input type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Saldo real (banco)</Label><Input value={reported} onChange={(e) => setReported(e.target.value)} placeholder="0,00" /></div>
              <div className="space-y-1.5"><Label>Data do saldo real</Label><Input type="date" value={reportedDate} onChange={(e) => setReportedDate(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Tolerância (R$)</Label><Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function AccountDetail({
  row, currency, privacy, dailySeries, onEdit,
}: {
  row: any; currency: string; privacy: boolean; dailySeries: any[]; onEdit: () => void;
}) {
  const a = row.account;
  const hasInitial = a.initial_balance != null && a.initial_balance_date;

  if (!hasInitial) {
    return (
      <EmptyState
        icon={Scale}
        title={`Informe o saldo inicial de ${a.name}`}
        description="Sem saldo inicial não dá para calcular o saldo atual da conta."
        action={<Button onClick={onEdit}>Informar saldo inicial</Button>}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Saldo inicial" value={Number(a.initial_balance)} currency={currency} privacy={privacy} sub={formatDate(a.initial_balance_date)} />
        <Stat label="Entradas" value={row.income} currency={currency} privacy={privacy} tone="emerald" />
        <Stat label="Saídas" value={row.expense} currency={currency} privacy={privacy} tone="rose" />
        <Stat label="Saldo calculado" value={row.calculated} currency={currency} privacy={privacy} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Conciliação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Saldo real informado</div>
              <div className="font-display text-2xl font-semibold">{row.reported != null ? formatCurrency(row.reported, currency, privacy) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Diferença</div>
              <div className={`font-display text-2xl font-semibold ${row.reported != null && Math.abs(row.diff) > 1 ? "text-rose-700" : "text-emerald-700"}`}>
                {row.reported != null ? formatCurrency(row.diff, currency, privacy) : "—"}
              </div>
            </div>
            <StatusBadge status={row.status} />
            <Button className="w-full" variant="outline" onClick={onEdit}>Atualizar saldos</Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Saldo diário</CardTitle></CardHeader>
          <CardContent>
            {dailySeries.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">Sem movimentações no período.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v), currency, false)} />
                  <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {row.reported != null && Math.abs(row.diff) > 1 && (
        <Card className="mb-6">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertCircle className="w-4 h-4 text-rose-600" />Possíveis causas da diferença</CardTitle></CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
              <li>Transação faltando ou duplicada na conta</li>
              <li>Transação lançada na conta errada</li>
              <li>Valor com sinal invertido (entrada como saída)</li>
              <li>Pagamento de cartão importado incorretamente</li>
              <li>Saldo inicial incorreto ou data de referência errada</li>
              <li>Taxa bancária não importada</li>
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Movimentos da conta</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                let running = Number(a.initial_balance ?? 0);
                const sorted = [...row.txs].sort((x: any, y: any) => x.date.localeCompare(y.date));
                return sorted.slice(-30).reverse().map((t: any) => {
                  // Compute running through full series, but show last 30 rows
                  // (For accuracy we'd recompute, but slice from end works after sort.)
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{formatDate(t.date)}</TableCell>
                      <TableCell className="text-sm">{t.description}</TableCell>
                      <TableCell className={`text-right text-sm ${t.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
                        {t.type === "income" ? "+" : "−"}{formatCurrency(Math.abs(Number(t.amount)), currency, privacy)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                    </TableRow>
                  );
                });
              })()}
              {row.txs.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Sem transações vinculadas a essa conta.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value, raw, currency, privacy, tone, sub }: { label: string; value?: number; raw?: string; currency?: string; privacy?: boolean; tone?: "emerald" | "rose"; sub?: string }) {
  const toneClass = tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "";
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-xl md:text-2xl font-semibold mt-1 ${toneClass}`}>
        {raw ?? formatCurrency(value ?? 0, currency ?? "BRL", privacy ?? false)}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    reconciled:    { label: "Conciliado", cls: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
    small_diff:    { label: "Pequena diferença", cls: "bg-amber-100 text-amber-800", icon: AlertCircle },
    relevant_diff: { label: "Diferença relevante", cls: "bg-rose-100 text-rose-800", icon: AlertCircle },
    no_balance:    { label: "Sem saldo informado", cls: "bg-muted text-muted-foreground", icon: AlertCircle },
    needs_review:  { label: "Revisar", cls: "bg-sky-100 text-sky-800", icon: AlertCircle },
  };
  const m = map[status] ?? map.no_balance;
  const Icon = m.icon;
  return <Badge variant="secondary" className={m.cls}><Icon className="w-3 h-3 mr-1" />{m.label}</Badge>;
}