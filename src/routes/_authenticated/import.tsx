import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  parseCsv,
  parseAmount,
  parseDateBR,
  sha256Hex,
  guessColumn,
  decodeCsvBuffer,
  buildImportHashSource,
  buildContentKey,
  importTypeFromAmount,
  type CsvRow,
} from "@/lib/csv";
import { formatCurrency } from "@/lib/format";
import {
  buildCardImportDescription,
  financialMonthKey,
  invoiceMonthForPaymentDate,
} from "@/lib/credit-card-reconciliation";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Target = "account" | "credit_card";

function currentDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type PreparedRow = {
  index: number;
  date: string | null;
  purchaseDate: string | null;
  sourceDescription: string;
  installment: string | null;
  description: string;
  amount: number | null;
  type: "income" | "expense";
  hash: string;
  duplicate: boolean;
  duplicateInBatch: boolean;
  contentKey: string;
  valid: boolean;
  selected: boolean;
  raw: CsvRow;
  invalidReasons: string[];
  externalId: string | null;
  invoiceMonth: string | null;
};

function ImportPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";

  const [target, setTarget] = useState<Target>("account");
  const [targetId, setTargetId] = useState<string>("");
  const [cardPaymentDate, setCardPaymentDate] = useState(currentDateKey);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState({
    date: "",
    description: "",
    amount: "",
    type: "",
    external_id: "",
    installment: "",
  });
  const [prepared, setPrepared] = useState<PreparedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [lastSummary, setLastSummary] = useState<null | {
    imported: number;
    skipped: number;
    invalid: number;
    duplicates: number;
  }>(null);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (await supabase.from("accounts").select("id,name").eq("workspace_id", wsId!).order("name"))
        .data ?? [],
  });
  const { data: cards } = useQuery({
    queryKey: ["credit_cards", wsId],
    enabled: !!wsId,
    queryFn: async () =>
      (
        await supabase
          .from("credit_cards")
          .select("id,name")
          .eq("workspace_id", wsId!)
          .order("name")
      ).data ?? [],
  });

  const targetOptions = target === "account" ? (accounts ?? []) : (cards ?? []);
  const selectedCardInvoiceMonth = invoiceMonthForPaymentDate(cardPaymentDate);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setPrepared([]);
    setLastSummary(null);
    let parsed: { headers: string[]; rows: CsvRow[] };
    try {
      const buf = await f.arrayBuffer();
      if (/\.xlsx$/i.test(f.name)) {
        const { parseXlsx } = await import("@/lib/xlsx");
        parsed = await parseXlsx(buf);
      } else {
        const text = decodeCsvBuffer(buf);
        parsed = parseCsv(text);
      }
      if (parsed.headers.length === 0) throw new Error("O arquivo não contém uma planilha válida.");
    } catch (err: any) {
      toast.error(`Falha ao ler o arquivo: ${err?.message ?? err}`);
      setHeaders([]);
      setRows([]);
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    // Nubank CSVs: conta = "Data,Valor,Identificador,Descrição"; cartão = "date,title,amount"
    const norm = parsed.headers.map((h) =>
      h
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    );
    const isNubankAccount =
      norm.includes("identificador") && norm.includes("valor") && norm.includes("descricao");
    const isNubankCard =
      norm.includes("date") &&
      norm.includes("title") &&
      norm.includes("amount") &&
      !norm.includes("valor");
    const isC6Card =
      norm.includes("data de compra") &&
      norm.includes("final do cartao") &&
      norm.includes("parcela");
    if (isNubankAccount) {
      toast.success("Nubank (conta) detectado — mapeamento automático aplicado.");
      if (target !== "account") setTargetId("");
      setTarget("account");
    } else if (isNubankCard || isC6Card) {
      toast.success(
        `${isC6Card ? "C6" : "Nubank"} (cartão) detectado — mapeamento automático aplicado.`,
      );
      if (target !== "credit_card") setTargetId("");
      setTarget("credit_card");
    }
    const guessedMapping = {
      date: guessColumn(parsed.headers, ["data", "date"]),
      description: guessColumn(parsed.headers, [
        "descricao",
        "descrição",
        "description",
        "historico",
        "histórico",
        "memo",
        "title",
        "lancamento",
        "lançamento",
      ]),
      amount: guessColumn(parsed.headers, ["valor", "amount", "value", "montante"]),
      type: guessColumn(parsed.headers, ["tipo", "type"]),
      external_id: guessColumn(parsed.headers, ["identificador", "id", "external_id"]),
      installment: guessColumn(parsed.headers, ["parcela", "installment", "prestacao"]),
    };
    setMapping(guessedMapping);
    if (
      guessedMapping.amount &&
      parsed.rows.every((row) => !(row[guessedMapping.amount] ?? "").trim())
    ) {
      toast.warning(
        "A coluna de valor existe, mas está vazia neste arquivo. Exporte novamente o extrato com os valores das transações.",
      );
    }
  }

  const canPreview =
    wsId &&
    targetId &&
    rows.length > 0 &&
    (target === "credit_card" ? cardPaymentDate : mapping.date) &&
    mapping.description &&
    mapping.amount;

  async function buildPreview() {
    if (!canPreview) {
      toast.error(
        target === "credit_card"
          ? "Selecione o cartão, informe a data de pagamento e mapeie descrição e valor."
          : "Selecione a conta e mapeie data, descrição e valor.",
      );
      return;
    }
    const seen = new Set<string>();
    const items: PreparedRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rawDate = r[mapping.date] ?? "";
      const rawAmt = r[mapping.amount] ?? "";
      const purchaseDate = parseDateBR(rawDate);
      const date = target === "credit_card" ? cardPaymentDate : purchaseDate;
      const amount = parseAmount(rawAmt);
      const sourceDescription = (r[mapping.description] ?? "").trim();
      const installment = mapping.installment
        ? (r[mapping.installment] ?? "").trim().slice(0, 30) || null
        : null;
      const description =
        target === "credit_card"
          ? buildCardImportDescription({
              description: sourceDescription,
              purchaseDate,
              paymentDate: cardPaymentDate,
              installment,
            })
          : sourceDescription.slice(0, 200);
      const externalId = mapping.external_id ? (r[mapping.external_id] ?? "").trim() || null : null;
      const reasons: string[] = [];
      if (target === "account" && !purchaseDate) {
        reasons.push(`data inválida (${rawDate || "vazia"})`);
      }
      if (target === "credit_card" && !cardPaymentDate) {
        reasons.push("data de pagamento da fatura não informada");
      }
      if (amount === null) reasons.push(`valor inválido (${rawAmt || "vazio"})`);
      if (!description) reasons.push("descrição vazia");
      let type: "income" | "expense" = "expense";
      if (mapping.type && r[mapping.type]) {
        const v = r[mapping.type].toLowerCase();
        if (/(receita|income|credito|crédito|entrada|c|credit)/i.test(v)) type = "income";
        else if (/(despesa|expense|debito|débito|saida|saída|d|debit)/i.test(v)) type = "expense";
      } else if (amount !== null) {
        type = importTypeFromAmount(amount, target);
      }
      const absAmount = amount === null ? null : Math.abs(amount);
      // Prefer external identifier (e.g. Nubank "Identificador") when present — stable across re-imports.
      const hashSrc = buildImportHashSource({
        workspaceId: wsId!,
        target,
        targetId,
        externalId,
        date: target === "credit_card" ? purchaseDate : date,
        amount: absAmount,
        description: sourceDescription,
      });
      const hash = await sha256Hex(hashSrc);
      const contentKey = buildContentKey(date, absAmount, description);
      const batchKey = externalId ? `ext:${externalId}` : contentKey;
      const duplicateInBatch = seen.has(hash) || seen.has(batchKey);
      seen.add(hash);
      seen.add(batchKey);
      const valid = reasons.length === 0;
      const invoiceMonth = target === "credit_card" ? selectedCardInvoiceMonth : null;
      items.push({
        index: i,
        date,
        purchaseDate,
        sourceDescription,
        installment,
        description,
        amount: absAmount,
        type,
        hash,
        duplicate: false,
        duplicateInBatch,
        contentKey,
        valid,
        selected: valid && !duplicateInBatch,
        raw: r,
        invalidReasons: reasons,
        externalId,
        invoiceMonth,
      });
    }

    // Check existing hashes in DB
    const hashes = Array.from(new Set(items.map((p) => p.hash)));
    const batchSize = 200;
    const existing = new Set<string>();
    for (let i = 0; i < hashes.length; i += batchSize) {
      const slice = hashes.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("transactions")
        .select("import_hash")
        .eq("workspace_id", wsId!)
        .in("import_hash", slice);
      if (error) {
        toast.error(error.message);
        return;
      }
      (data ?? []).forEach((x: any) => x.import_hash && existing.add(x.import_hash));
    }
    for (const it of items) {
      if (existing.has(it.hash)) {
        it.duplicate = true;
        it.selected = false;
      }
    }

    // Content-based check against transactions already registered without an
    // import_hash (legacy or manual entries), restricted to this workspace and
    // to the destination account/card, within the file's date range.
    const dates = items
      .map((p) => p.date)
      .filter((d): d is string => !!d)
      .sort();
    if (dates.length > 0) {
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];
      const existingKeys = new Set<string>();
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        let q = supabase
          .from("transactions")
          .select("date,amount,description")
          .eq("workspace_id", wsId!)
          .gte("date", minDate)
          .lte("date", maxDate)
          .order("date", { ascending: true })
          .range(from, from + pageSize - 1);
        q = target === "account" ? q.eq("account_id", targetId) : q.eq("credit_card_id", targetId);
        const { data, error } = await q;
        if (error) {
          toast.error(error.message);
          return;
        }
        for (const row of data ?? []) {
          existingKeys.add(
            buildContentKey(
              (row as any).date,
              Number((row as any).amount),
              (row as any).description,
            ),
          );
        }
        if (!data || data.length < pageSize) break;
      }
      for (const it of items) {
        if (!it.duplicate && existingKeys.has(it.contentKey)) {
          it.duplicate = true;
          it.selected = false;
        }
      }
    }

    setPrepared(items);
    const dupCount = items.filter((p) => p.duplicate || p.duplicateInBatch).length;
    toast.success(
      `Prévia gerada: ${items.length} linhas · ${dupCount} possíveis duplicatas desmarcadas`,
    );
  }

  const summary = useMemo(
    () => ({
      total: prepared.length,
      valid: prepared.filter((p) => p.valid).length,
      duplicates: prepared.filter((p) => p.duplicate || p.duplicateInBatch).length,
      selected: prepared.filter((p) => p.selected).length,
    }),
    [prepared],
  );

  const importMut = useMutation({
    mutationFn: async () => {
      const selected = prepared.filter((p) => p.selected && p.valid);
      if (selected.length === 0) throw new Error("Nada selecionado");
      const { data: userData } = await supabase.auth.getUser();
      const created_by = userData.user?.id ?? null;
      const payload = selected.map((p) => ({
        workspace_id: wsId!,
        date: p.date!,
        month: Number(
          financialMonthKey({
            id: p.hash,
            date: p.date!,
            type: p.type,
            amount: p.amount!,
            credit_card_id: target === "credit_card" ? targetId : null,
            invoice_month: p.invoiceMonth,
          }).slice(5, 7),
        ),
        year: Number(
          financialMonthKey({
            id: p.hash,
            date: p.date!,
            type: p.type,
            amount: p.amount!,
            credit_card_id: target === "credit_card" ? targetId : null,
            invoice_month: p.invoiceMonth,
          }).slice(0, 4),
        ),
        type: p.type,
        description: p.description || "(sem descrição)",
        amount: p.amount!,
        account_id: target === "account" ? targetId : null,
        credit_card_id: target === "credit_card" ? targetId : null,
        invoice_month: target === "credit_card" ? p.invoiceMonth : null,
        installment: target === "credit_card" ? p.installment : null,
        source: "csv",
        import_hash:
          p.duplicate || p.duplicateInBatch
            ? `${p.hash}:confirmada:${crypto.randomUUID()}`
            : p.hash,
        created_by,
      }));
      // Upsert with `ignoreDuplicates` against the unique index on
      // (workspace_id, import_hash). Under Postgres, ON CONFLICT DO NOTHING
      // returns only the truly inserted rows, so `data.length` = inserted
      // and `slice.length - data.length` = conflict-skipped duplicates.
      // Real errors (validation, RLS, etc.) are surfaced — not silently
      // counted as duplicates. Errors are collected per-chunk to preserve
      // partial success across large imports.
      const chunk = 500;
      let imported = 0;
      let conflictSkipped = 0;
      const errors: string[] = [];
      for (let i = 0; i < payload.length; i += chunk) {
        const slice = payload.slice(i, i + chunk);
        const { data, error } = await supabase
          .from("transactions")
          .upsert(slice as any, { onConflict: "workspace_id,import_hash", ignoreDuplicates: true })
          .select("id");
        if (error) {
          errors.push(`Linhas ${i + 1}–${i + slice.length}: ${error.message}`);
          continue;
        }
        const inserted = data?.length ?? 0;
        imported += inserted;
        conflictSkipped += slice.length - inserted;
      }
      return { imported, conflictSkipped, errors };
    },
    onSuccess: ({ imported, conflictSkipped, errors }) => {
      const invalid = prepared.filter((p) => !p.valid).length;
      const duplicates = prepared.filter((p) => p.duplicate || p.duplicateInBatch).length;
      setLastSummary({ imported, skipped: conflictSkipped, invalid, duplicates });
      if (errors.length > 0) {
        toast.error(
          `${imported} importadas · ${conflictSkipped} duplicadas · ${errors.length} erros de inserção`,
        );
        for (const msg of errors.slice(0, 3)) toast.error(msg);
      } else {
        toast.success(
          `${imported} importadas · ${conflictSkipped} duplicadas puladas · ${invalid} inválidas`,
        );
      }
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      setPrepared([]);
      setRows([]);
      setHeaders([]);
      setFileName("");
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setImporting(false),
  });

  function toggleAll(v: boolean) {
    setPrepared((prev) =>
      prev.map((p) => ({ ...p, selected: v && p.valid && !p.duplicate && !p.duplicateInBatch })),
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Importar transações"
        helpKey="financial.import"
        description="Importe arquivos CSV ou XLSX de contas e cartões. Duplicidades são detectadas automaticamente."
      />

      <Card className="mb-4">
        <CardContent className="p-5 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-2 block">Destino</Label>
              <Tabs
                value={target}
                onValueChange={(v) => {
                  setTarget(v as Target);
                  setTargetId("");
                  setPrepared([]);
                }}
              >
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="account">Conta</TabsTrigger>
                  <TabsTrigger value="credit_card">Cartão</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="mb-2 block">
                {target === "account" ? "Conta corrente" : "Cartão"}
              </Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {targetOptions.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {targetOptions.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Cadastre {target === "account" ? "uma conta" : "um cartão"} primeiro.
                </p>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Arquivo CSV ou XLSX</Label>
              <Input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFile}
              />
              {fileName && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {fileName} · {rows.length} linhas
                </p>
              )}
            </div>
          </div>

          {headers.length > 0 && (
            <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t">
              {(
                ["date", "description", "amount", "installment", "type", "external_id"] as const
              ).map((k) => (
                <div key={k}>
                  <Label className="mb-2 block capitalize">
                    {k === "date"
                      ? target === "credit_card"
                        ? "Data original (opcional)"
                        : "Data"
                      : k === "description"
                        ? "Descrição"
                        : k === "amount"
                          ? "Valor"
                          : k === "installment"
                            ? "Parcela (opcional)"
                            : k === "type"
                              ? "Tipo (opcional)"
                              : "ID externo (opcional)"}
                  </Label>
                  <Select
                    value={mapping[k]}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [k]: v === "__none" ? "" : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {(k === "type" ||
                        k === "external_id" ||
                        k === "installment" ||
                        (k === "date" && target === "credit_card")) && (
                        <SelectItem value="__none">— Nenhum —</SelectItem>
                      )}
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {target === "credit_card" && (
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_3fr] sm:items-end">
              <div>
                <Label className="mb-2 block">Data de pagamento da fatura</Label>
                <Input
                  type="date"
                  value={cardPaymentDate}
                  onChange={(event) => {
                    const paymentDate = event.target.value;
                    setCardPaymentDate(paymentDate);
                    if (!paymentDate) {
                      setPrepared([]);
                      return;
                    }
                    setPrepared((current) =>
                      current.map((row) => ({
                        ...row,
                        date: paymentDate,
                        invoiceMonth: invoiceMonthForPaymentDate(paymentDate),
                        description: buildCardImportDescription({
                          description: row.sourceDescription,
                          purchaseDate: row.purchaseDate,
                          paymentDate,
                          installment: row.installment,
                        }),
                      })),
                    );
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Todas as compras deste arquivo serão registradas nesta data. A data original e a
                parcela continuam visíveis na descrição da transação.
              </p>
            </div>
          )}

          {headers.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={buildPreview} disabled={!canPreview}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Gerar prévia
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {lastSummary && (
        <Card className="mb-4">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <Badge className="bg-[var(--income)]/10 text-[var(--income)]">
              {lastSummary.imported} importadas
            </Badge>
            <Badge className="bg-amber-500/15 text-amber-700">
              {lastSummary.skipped} duplicadas puladas
            </Badge>
            <Badge variant="destructive">{lastSummary.invalid} inválidas</Badge>
            <Badge variant="outline">
              {lastSummary.duplicates} possíveis duplicatas detectadas
            </Badge>
          </CardContent>
        </Card>
      )}

      {prepared.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Upload}
              title="Envie um arquivo CSV ou XLSX"
              description="Selecione o destino, escolha o arquivo e mapeie as colunas. A prévia compara data, valor e descrição e deixa você decidir o que importar."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {target === "credit_card" && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong>Regra do arquivo de cartão:</strong> valor positivo é compra/despesa; valor
                negativo é pagamento, estorno ou crédito. A transação usa a data de pagamento da
                fatura; a data original e a parcela aparecem somente na descrição.
              </div>
            )}
            <div className="p-4 flex flex-wrap items-center gap-3 border-b">
              <Badge variant="secondary">{summary.total} linhas</Badge>
              <Badge className="bg-[var(--income)]/10 text-[var(--income)] hover:bg-[var(--income)]/10">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {summary.valid} válidas
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {summary.duplicates} possíveis duplicatas
              </Badge>
              <Badge variant="outline">{summary.selected} selecionadas</Badge>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>
                  Selecionar somente novas
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>
                  Limpar
                </Button>
                <Button
                  onClick={() => {
                    setImporting(true);
                    importMut.mutate();
                  }}
                  disabled={importing || summary.selected === 0}
                >
                  Importar {summary.selected > 0 ? `(${summary.selected})` : ""}
                </Button>
              </div>
            </div>
            {summary.duplicates > 0 && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Possíveis duplicatas começam desmarcadas. Confira valor e descrição e marque
                individualmente somente aquelas que deseja importar mesmo assim.
              </div>
            )}
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{target === "credit_card" ? "Data registrada" : "Data"}</TableHead>
                    {target === "credit_card" && <TableHead>Referência da compra</TableHead>}
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prepared.map((p) => (
                    <TableRow key={p.index} className={!p.valid ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={p.selected}
                          disabled={!p.valid}
                          onCheckedChange={(v) =>
                            setPrepared((prev) =>
                              prev.map((x) => (x.index === p.index ? { ...x, selected: !!v } : x)),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {p.date ?? <span className="text-destructive">inválida</span>}
                      </TableCell>
                      {target === "credit_card" && (
                        <TableCell className="whitespace-nowrap text-sm">
                          {p.purchaseDate ?? "Sem data original"}
                          {p.installment && !/^única$/i.test(p.installment) ? (
                            <span className="block text-xs text-muted-foreground">
                              Parcela {p.installment}
                            </span>
                          ) : null}
                        </TableCell>
                      )}
                      <TableCell className="max-w-md truncate">
                        {p.description || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            p.type === "income"
                              ? "text-[var(--income)] border-[var(--income)]/30"
                              : "text-[var(--expense)] border-[var(--expense)]/30"
                          }
                        >
                          {target === "credit_card"
                            ? p.type === "income"
                              ? "Pagamento/crédito"
                              : "Compra/despesa"
                            : p.type === "income"
                              ? "Entrada"
                              : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.amount !== null ? formatCurrency(p.amount, currency) : "—"}
                      </TableCell>
                      <TableCell>
                        {p.duplicate ? (
                          <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                            {p.selected
                              ? "Possível duplicata · será importada"
                              : "Possível duplicata · desmarcada"}
                          </Badge>
                        ) : p.duplicateInBatch ? (
                          <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                            {p.selected
                              ? "Repetida no arquivo · será importada"
                              : "Repetida no arquivo · desmarcada"}
                          </Badge>
                        ) : !p.valid ? (
                          <Badge variant="destructive" title={p.invalidReasons.join("; ")}>
                            Inválida: {p.invalidReasons.join(", ")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Nova</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
