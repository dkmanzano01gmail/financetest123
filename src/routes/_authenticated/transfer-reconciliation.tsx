import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import {
  buildInternalTransferReconciliation,
  type InternalTransferGroup,
  type TransferReconciliationStatus,
  type TransferReconciliationTransaction,
} from "@/lib/internal-transfer-reconciliation";
import { fetchSupabasePages } from "@/lib/supabase-pagination";

export const Route = createFileRoute("/_authenticated/transfer-reconciliation")({
  component: TransferReconciliationPage,
});

const NOW = new Date();
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type Account = { id: string; name: string; type: string; is_active: boolean };
type EditForm = {
  groupId: string;
  date: string;
  amount: string;
  description: string;
  sourceAccountId: string;
  destinationAccountId: string;
  notes: string;
};

type RpcResult = Promise<{ error: { message: string } | null }>;
const callRpc = (functionName: string, parameters: Record<string, unknown>): RpcResult =>
  (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => RpcResult)(
    functionName,
    parameters,
  );

const STATUS_LABEL: Record<TransferReconciliationStatus, string> = {
  reconciled: "Conciliada",
  candidate: "Contrapartida encontrada",
  missing: "Contrapartida pendente",
  invalid: "Cadastro incompleto",
};

function statusClass(status: TransferReconciliationStatus) {
  if (status === "reconciled") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "candidate") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-red-300 bg-red-50 text-red-800";
}

function TransferReconciliationPage() {
  const { workspace } = useCurrentWorkspace();
  const queryClient = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [accountFilter, setAccountFilter] = useState("all");
  const [edit, setEdit] = useState<EditForm | null>(null);

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const accountsQuery = useQuery({
    queryKey: ["transfer-reconciliation-accounts", wsId],
    enabled: Boolean(wsId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,type,is_active")
        .eq("workspace_id", wsId!)
        .neq("type", "investment")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const transactionsQuery = useQuery({
    queryKey: ["transfer-reconciliation-transactions", wsId, start, end],
    enabled: Boolean(wsId),
    queryFn: () =>
      fetchSupabasePages<TransferReconciliationTransaction>((from, to) =>
        supabase
          .from("transactions")
          .select(
            "id,date,type,amount,description,account_id,linked_account_id,financial_role,transfer_group_id,source,method,notes,status,reconciliation_method",
          )
          .eq("workspace_id", wsId!)
          .gte("date", start)
          .lte("date", end)
          .not("account_id", "is", null)
          .order("date")
          .order("id")
          .range(from, to),
      ),
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const groups = useMemo(
    () => buildInternalTransferReconciliation(transactionsQuery.data ?? []),
    [transactionsQuery.data],
  );
  const visibleGroups = useMemo(
    () =>
      accountFilter === "all"
        ? groups
        : groups.filter((group) => group.rows.some((row) => row.account_id === accountFilter)),
    [accountFilter, groups],
  );
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const pendingGroups = useMemo(
    () =>
      visibleGroups.filter((group) => {
        if (group.status === "reconciled") return false;
        if (!group.mergeCandidateGroupId) return true;
        return group.id.localeCompare(group.mergeCandidateGroupId) < 0;
      }),
    [visibleGroups],
  );
  const visibleAccounts =
    accountFilter === "all" ? accounts : accounts.filter((account) => account.id === accountFilter);
  const days = Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => index + 1);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transfer-reconciliation-transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["recon-txs"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (form: EditForm) => {
      const amount = Number(form.amount.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor positivo.");
      const { error } = await callRpc("update_internal_transfer_group", {
        p_workspace_id: wsId,
        p_transfer_group_id: form.groupId,
        p_date: form.date,
        p_amount: amount,
        p_description: form.description,
        p_source_account_id: form.sourceAccountId,
        p_destination_account_id: form.destinationAccountId,
        p_notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setEdit(null);
      toast.success("Transferência atualizada nas duas contas.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconcileMutation = useMutation({
    mutationFn: async ({ groupId, candidateId }: { groupId: string; candidateId: string }) => {
      const { error } = await callRpc("reconcile_internal_transfer_counterpart", {
        p_workspace_id: wsId,
        p_transfer_group_id: groupId,
        p_candidate_transaction_id: candidateId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Contrapartida bancária vinculada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mergeMutation = useMutation({
    mutationFn: async ({
      groupId,
      matchingGroupId,
    }: {
      groupId: string;
      matchingGroupId: string;
    }) => {
      const { error } = await callRpc("merge_internal_transfer_groups", {
        p_workspace_id: wsId,
        p_primary_group_id: groupId,
        p_matching_group_id: matchingGroupId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Lançamentos bancários consolidados; contrapartidas gerenciais arquivadas.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openEdit(group: InternalTransferGroup) {
    if (!group.outgoing || !group.incoming || group.id.startsWith("orphan:")) {
      toast.error("Complete o cadastro desta transferência pela lista de pendências.");
      return;
    }
    setEdit({
      groupId: group.id,
      date: group.outgoing.date,
      amount: String(group.amount).replace(".", ","),
      description: group.outgoing.description,
      sourceAccountId: group.outgoing.account_id ?? "",
      destinationAccountId: group.incoming.account_id ?? "",
      notes: group.outgoing.notes ?? "",
    });
  }

  const total = visibleGroups.length;
  const reconciled = visibleGroups.filter((group) => group.status === "reconciled").length;
  const candidates = pendingGroups.filter((group) => group.status === "candidate").length;
  const pending = pendingGroups.length;

  if (accountsQuery.error || transactionsQuery.error) {
    const error = (accountsQuery.error || transactionsQuery.error) as Error;
    return (
      <PageContainer>
        <PageHeader title="Conciliação de transferências" />
        <Card>
          <CardContent className="p-6 text-destructive">
            Não foi possível carregar: {error.message}
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Conciliação de transferências"
        description="Confira se cada transferência interna possui a contrapartida importada na conta correspondente."
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, index) => (
              <SelectItem key={name} value={String(index + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 7 }, (_, index) => NOW.getFullYear() - 4 + index).map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="min-w-56">
            <SelectValue placeholder="Todas as contas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Transferências" value={total} />
        <Metric label="Conciliadas" value={reconciled} good />
        <Metric label="Sugestões encontradas" value={candidates} />
        <Metric label="Exigem atenção" value={pending} warning={pending > 0} />
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div
                className="grid border-b bg-muted/35"
                style={{
                  gridTemplateColumns: `72px repeat(${Math.max(visibleAccounts.length, 1)}, minmax(220px, 1fr))`,
                }}
              >
                <div className="sticky left-0 z-10 bg-muted/90 p-3 text-xs font-semibold uppercase">
                  Dia
                </div>
                {visibleAccounts.map((account) => (
                  <div key={account.id} className="border-l p-3 text-sm font-semibold">
                    {account.name}
                    {!account.is_active && (
                      <span className="ml-1 text-xs text-muted-foreground">(inativa)</span>
                    )}
                  </div>
                ))}
              </div>
              {days.map((day) => (
                <div
                  key={day}
                  className="grid min-h-14 border-b last:border-b-0"
                  style={{
                    gridTemplateColumns: `72px repeat(${Math.max(visibleAccounts.length, 1)}, minmax(220px, 1fr))`,
                  }}
                >
                  <div className="sticky left-0 z-10 bg-background p-3 text-sm font-semibold">
                    {String(day).padStart(2, "0")}
                  </div>
                  {visibleAccounts.map((account) => {
                    const cellGroups = visibleGroups.filter((group) =>
                      group.rows.some(
                        (row) =>
                          row.account_id === account.id && Number(row.date.slice(8, 10)) === day,
                      ),
                    );
                    return (
                      <div key={account.id} className="space-y-2 border-l p-2">
                        {cellGroups.map((group) => (
                          <TransferChip
                            key={group.id}
                            group={group}
                            accountId={account.id}
                            accountById={accountById}
                            currency={currency}
                            privacy={privacy}
                            onEdit={() => openEdit(group)}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Pendências e sugestões</h2>
          <p className="text-sm text-muted-foreground">
            Nada é apagado: ao usar um lançamento importado, a linha gerada fica preservada no
            histórico.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {pendingGroups.map((group) => (
          <PendingCard
            key={group.id}
            group={group}
            accountById={accountById}
            currency={currency}
            privacy={privacy}
            onEdit={() => openEdit(group)}
            onReconcile={(candidateId) =>
              reconcileMutation.mutate({ groupId: group.id, candidateId })
            }
            mergeCandidate={
              group.mergeCandidateGroupId
                ? (groupById.get(group.mergeCandidateGroupId) ?? null)
                : null
            }
            onMerge={(matchingGroupId) =>
              mergeMutation.mutate({ groupId: group.id, matchingGroupId })
            }
            busy={reconcileMutation.isPending || mergeMutation.isPending}
          />
        ))}
        {!transactionsQuery.isLoading && pendingGroups.length === 0 && (
          <Card>
            <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Nenhuma pendência neste período.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={Boolean(edit)} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar transferência</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={edit.date}
                  onChange={(event) => setEdit({ ...edit, date: event.target.value })}
                />
              </div>
              <div>
                <Label>Valor</Label>
                <Input
                  inputMode="decimal"
                  value={edit.amount}
                  onChange={(event) => setEdit({ ...edit, amount: event.target.value })}
                />
              </div>
              <div>
                <Label>Conta de origem</Label>
                <AccountSelect
                  accounts={accounts}
                  value={edit.sourceAccountId}
                  onChange={(value) => setEdit({ ...edit, sourceAccountId: value })}
                />
              </div>
              <div>
                <Label>Conta de destino</Label>
                <AccountSelect
                  accounts={accounts}
                  value={edit.destinationAccountId}
                  onChange={(value) => setEdit({ ...edit, destinationAccountId: value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Descrição</Label>
                <Input
                  value={edit.description}
                  onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={edit.notes}
                  onChange={(event) => setEdit({ ...edit, notes: event.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !edit ||
                saveMutation.isPending ||
                edit.sourceAccountId === edit.destinationAccountId
              }
              onClick={() => edit && saveMutation.mutate(edit)}
            >
              Salvar nas duas contas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Metric({
  label,
  value,
  good,
  warning,
}: {
  label: string;
  value: number;
  good?: boolean;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold ${good ? "text-emerald-700" : warning ? "text-destructive" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function TransferChip({
  group,
  accountId,
  accountById,
  currency,
  privacy,
  onEdit,
}: {
  group: InternalTransferGroup;
  accountId: string;
  accountById: Map<string, Account>;
  currency: string;
  privacy: boolean;
  onEdit: () => void;
}) {
  const side = group.rows.find((row) => row.account_id === accountId);
  const otherId = side?.linked_account_id;
  const direction = side?.type === "expense" ? "→" : "←";
  return (
    <button
      type="button"
      onClick={onEdit}
      className={`w-full rounded-lg border p-2 text-left text-xs transition hover:shadow-sm ${statusClass(group.status)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {direction} {accountById.get(otherId ?? "")?.name ?? "Conta não definida"}
        </span>
        <Pencil className="h-3 w-3 shrink-0" />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span>{formatCurrency(group.amount, currency, privacy)}</span>
        <span>{STATUS_LABEL[group.status]}</span>
      </div>
    </button>
  );
}

function PendingCard({
  group,
  accountById,
  currency,
  privacy,
  onEdit,
  onReconcile,
  mergeCandidate,
  onMerge,
  busy,
}: {
  group: InternalTransferGroup;
  accountById: Map<string, Account>;
  currency: string;
  privacy: boolean;
  onEdit: () => void;
  onReconcile: (candidateId: string) => void;
  mergeCandidate: InternalTransferGroup | null;
  onMerge: (matchingGroupId: string) => void;
  busy: boolean;
}) {
  const source = accountById.get(group.outgoing?.account_id ?? "")?.name ?? "Origem não definida";
  const destination =
    accountById.get(group.incoming?.account_id ?? "")?.name ?? "Destino não definido";
  const candidate = group.candidates[0];
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">
                {source} → {destination}
              </p>
              <Badge variant="outline" className={statusClass(group.status)}>
                {STATUS_LABEL[group.status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.date ? group.date.split("-").reverse().join("/") : "Data não definida"} ·{" "}
              {formatCurrency(group.amount, currency, privacy)}
            </p>
            {candidate && (
              <p className="mt-1 text-sm">
                Encontrada em {accountById.get(candidate.account_id ?? "")?.name}:{" "}
                {candidate.description} ({candidate.date.split("-").reverse().join("/")}).
              </p>
            )}
            {mergeCandidate && (
              <p className="mt-1 text-sm">
                Os dois lados bancários já foram importados. Ao consolidar, somente esses dois
                lançamentos ficarão ativos e as contrapartidas gerenciais serão arquivadas.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar
          </Button>
          {candidate && !group.id.startsWith("orphan:") && (
            <Button size="sm" disabled={busy} onClick={() => onReconcile(candidate.id)}>
              <Link2 className="mr-1 h-4 w-4" />
              Usar contrapartida
            </Button>
          )}
          {mergeCandidate && !group.id.startsWith("orphan:") && (
            <Button size="sm" disabled={busy} onClick={() => onMerge(mergeCandidate.id)}>
              <Link2 className="mr-1 h-4 w-4" />
              Consolidar lançamentos reais
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
