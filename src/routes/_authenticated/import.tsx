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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { parseCsv, parseAmount, parseDateBR, sha256Hex, guessColumn, type CsvRow } from "@/lib/csv";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type Target = "account" | "credit_card";

type PreparedRow = {
  index: number;
  date: string | null;
  description: string;
  amount: number | null;
  type: "income" | "expense";
  hash: string;
  duplicate: boolean;
  duplicateInBatch: boolean;
  valid: boolean;
  selected: boolean;
  raw: CsvRow;
};

function ImportPage() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";

  const [target, setTarget] = useState<Target>("account");
  const [targetId, setTargetId] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState({ date: "", description: "", amount: "", type: "" });
  const [prepared, setPrepared] = useState<PreparedRow[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", wsId],
    enabled: !!wsId,
    queryFn: async () => (await supabase.from("accounts").select("id,name").eq("workspace_id", wsId!).order("name")).data ?? [],
  });
  const { data: cards } = useQuery({
    queryKey: ["credit_cards", wsId],
    enabled: !!wsId,
    queryFn: async () => (await supabase.from("credit_cards").select("id,name").eq("workspace_id", wsId!).order("name")).data ?? [],
  });

  const targetOptions = target === "account" ? accounts ?? [] : cards ?? [];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping({
      date: guessColumn(parsed.headers, ["data", "date"]),
      description: guessColumn(parsed.headers, ["descricao", "descrição", "description", "historico", "histórico", "memo", "title"]),
      amount: guessColumn(parsed.headers, ["valor", "amount", "value", "montante"]),
      type: guessColumn(parsed.headers, ["tipo", "type"]),
    });
    setPrepared([]);
  }

  const canPreview = wsId && targetId && rows.length > 0 && mapping.date && mapping.description && mapping.amount;

  async function buildPreview() {
    if (!canPreview) { toast.error("Selecione destino e mapeie data, descrição e valor."); return; }
    const seen = new Set<string>();
    const items: PreparedRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const date = parseDateBR(r[mapping.date] ?? "");
      const amount = parseAmount(r[mapping.amount] ?? "");
      const description = (r[mapping.description] ?? "").slice(0, 200);
      let type: "income" | "expense" = "expense";
      if (mapping.type && r[mapping.type]) {
        const v = r[mapping.type].toLowerCase();
        if (/(receita|income|credito|crédito|entrada|c|credit)/i.test(v)) type = "income";
        else if (/(despesa|expense|debito|débito|saida|saída|d|debit)/i.test(v)) type = "expense";
      } else if (amount !== null) {
        type = amount >= 0 ? "income" : "expense";
      }
      const absAmount = amount === null ? null : Math.abs(amount);
      const hashSrc = `${wsId}|${target}|${targetId}|${date ?? ""}|${absAmount ?? ""}|${description.trim().toLowerCase()}`;
      const hash = await sha256Hex(hashSrc);
      const duplicateInBatch = seen.has(hash);
      seen.add(hash);
      const valid = !!(date && absAmount !== null && description);
      items.push({
        index: i, date, description, amount: absAmount, type, hash,
        duplicate: false, duplicateInBatch, valid, selected: valid && !duplicateInBatch, raw: r,
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
      if (error) { toast.error(error.message); return; }
      (data ?? []).forEach((x: any) => x.import_hash && existing.add(x.import_hash));
    }
    for (const it of items) {
      if (existing.has(it.hash)) { it.duplicate = true; it.selected = false; }
    }
    setPrepared(items);
    toast.success(`Prévia gerada: ${items.length} linhas`);
  }

  const summary = useMemo(() => ({
    total: prepared.length,
    valid: prepared.filter((p) => p.valid).length,
    duplicates: prepared.filter((p) => p.duplicate || p.duplicateInBatch).length,
    selected: prepared.filter((p) => p.selected).length,
  }), [prepared]);

  const importMut = useMutation({
    mutationFn: async () => {
      const selected = prepared.filter((p) => p.selected && p.valid);
      if (selected.length === 0) throw new Error("Nada selecionado");
      const { data: userData } = await supabase.auth.getUser();
      const created_by = userData.user?.id ?? null;
      const payload = selected.map((p) => ({
        workspace_id: wsId!,
        date: p.date!,
        type: p.type,
        description: p.description || "(sem descrição)",
        amount: p.amount!,
        account_id: target === "account" ? targetId : null,
        credit_card_id: target === "credit_card" ? targetId : null,
        source: "csv",
        import_hash: p.hash,
        created_by,
      }));
      const chunk = 500;
      for (let i = 0; i < payload.length; i += chunk) {
        const { error } = await supabase.from("transactions").insert(payload.slice(i, i + chunk));
        if (error) throw error;
      }
      return selected.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} transações importadas`);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setPrepared([]); setRows([]); setHeaders([]); setFileName("");
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setImporting(false),
  });

  function toggleAll(v: boolean) {
    setPrepared((prev) => prev.map((p) => ({ ...p, selected: v && p.valid && !p.duplicate && !p.duplicateInBatch })));
  }

  return (
    <PageContainer>
      <PageHeader title="Importar CSV" description="Importe extratos de contas e faturas de cartões. Duplicidades são detectadas automaticamente." />

      <Card className="mb-4">
        <CardContent className="p-5 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label className="mb-2 block">Destino</Label>
              <Tabs value={target} onValueChange={(v) => { setTarget(v as Target); setTargetId(""); }}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="account">Conta</TabsTrigger>
                  <TabsTrigger value="credit_card">Cartão</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="mb-2 block">{target === "account" ? "Conta corrente" : "Cartão"}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {targetOptions.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {targetOptions.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Cadastre {target === "account" ? "uma conta" : "um cartão"} primeiro.</p>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Arquivo CSV</Label>
              <Input type="file" accept=".csv,text/csv" onChange={onFile} />
              {fileName && <p className="text-xs text-muted-foreground mt-1 truncate">{fileName} · {rows.length} linhas</p>}
            </div>
          </div>

          {headers.length > 0 && (
            <div className="grid md:grid-cols-4 gap-3 pt-2 border-t">
              {(["date","description","amount","type"] as const).map((k) => (
                <div key={k}>
                  <Label className="mb-2 block capitalize">
                    {k === "date" ? "Data" : k === "description" ? "Descrição" : k === "amount" ? "Valor" : "Tipo (opcional)"}
                  </Label>
                  <Select value={mapping[k]} onValueChange={(v) => setMapping((m) => ({ ...m, [k]: v === "__none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {k === "type" && <SelectItem value="__none">— Nenhum —</SelectItem>}
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
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

      {prepared.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Upload}
              title="Envie um arquivo CSV"
              description="Selecione o destino, escolha o arquivo e mapeie as colunas. A prévia mostra duplicidades detectadas por hash."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 flex flex-wrap items-center gap-3 border-b">
              <Badge variant="secondary">{summary.total} linhas</Badge>
              <Badge className="bg-[var(--income)]/10 text-[var(--income)] hover:bg-[var(--income)]/10"><CheckCircle2 className="w-3 h-3 mr-1" />{summary.valid} válidas</Badge>
              <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10"><AlertTriangle className="w-3 h-3 mr-1" />{summary.duplicates} duplicadas</Badge>
              <Badge variant="outline">{summary.selected} selecionadas</Badge>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>Selecionar todas</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>Limpar</Button>
                <Button
                  onClick={() => { setImporting(true); importMut.mutate(); }}
                  disabled={importing || summary.selected === 0}
                >
                  Importar {summary.selected > 0 ? `(${summary.selected})` : ""}
                </Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Data</TableHead>
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
                          onCheckedChange={(v) => setPrepared((prev) => prev.map((x) => x.index === p.index ? { ...x, selected: !!v } : x))}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{p.date ?? <span className="text-destructive">inválida</span>}</TableCell>
                      <TableCell className="max-w-md truncate">{p.description || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.type === "income" ? "text-[var(--income)] border-[var(--income)]/30" : "text-[var(--expense)] border-[var(--expense)]/30"}>
                          {p.type === "income" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.amount !== null ? formatCurrency(p.amount, currency) : "—"}</TableCell>
                      <TableCell>
                        {p.duplicate ? <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">Já existe</Badge>
                          : p.duplicateInBatch ? <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">Repetida no arquivo</Badge>
                          : !p.valid ? <Badge variant="destructive">Inválida</Badge>
                          : <Badge variant="secondary">Nova</Badge>}
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