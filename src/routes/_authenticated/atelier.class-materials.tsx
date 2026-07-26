import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { formatCurrency, monthLabel, parseLocaleAmount } from "@/lib/format";
import { calculateClassPieceCost } from "@/lib/orna-logic";
import { Package, Pencil, Plus, Settings2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/atelier/class-materials")({ component: Page });
const sb = supabase as any;
const NOW = new Date();
const n = (value: string) => {
  const parsed = parseLocaleAmount(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const empty = () => ({
  usage_date: new Date().toISOString().slice(0, 10),
  student_name: "",
  piece_name: "",
  quantity: "1",
  clay_weight_kg: "0",
  clay_type: "",
  length_cm: "0",
  depth_cm: "0",
  height_cm: "0",
  glaze_cone: "6",
  glaze_name: "",
  glaze_quantity: "0",
  other_cost: "0",
  charge_biscuit: true,
  charge_glaze: true,
  amount_charged: "",
  amount_paid: "0",
  payment_status: "pending",
  payment_date: "",
  payment_notes: "",
  comments: "",
});

function Page() {
  const { workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const wsId = workspace?.id;
  const currency = workspace?.currency ?? "BRL";
  const privacy = workspace?.privacy_mode ?? false;
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [year, setYear] = useState(NOW.getFullYear());
  const [periodMode, setPeriodMode] = useState("month");
  const [studentFilter, setStudentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty());
  const [settingsForm, setSettingsForm] = useState({
    margin_percent: "0",
    fixed_monthly_fee: "600",
    kiln_firing_profit_percent: "100",
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["class_materials_usage", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("class_materials_usage")
        .select("*")
        .eq("workspace_id", wsId)
        .order("usage_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students", wsId, "class-materials"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("students")
        .select("id,name,class_name,monthly_fee,is_active")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["raw_materials", wsId, "class-materials"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("raw_materials")
        .select("id,name,material_type,unit,unit_cost,is_active,recommended_cone")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: classSettings } = useQuery({
    queryKey: ["class_material_settings", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("class_material_settings")
        .select("*")
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (error) throw error;
      return data ?? {
        margin_percent: 0,
        fixed_monthly_fee: 600,
        kiln_firing_profit_percent: 100,
      };
    },
  });
  useEffect(() => {
    if (!classSettings) return;
    setSettingsForm({
      margin_percent: String(classSettings.margin_percent ?? 0),
      fixed_monthly_fee: String(classSettings.fixed_monthly_fee ?? 600),
      kiln_firing_profit_percent: String(classSettings.kiln_firing_profit_percent ?? 100),
    });
  }, [classSettings]);

  const { data: firingSettings } = useQuery({
    queryKey: ["firing_settings", wsId, "class-materials"],
    enabled: !!wsId,
    queryFn: async () =>
      (await sb.from("firing_settings").select("*").eq("workspace_id", wsId).maybeSingle()).data ?? null,
  });

  const filtered = useMemo(() => {
    return (rows as any[]).filter((row) => {
      const date = new Date(`${row.usage_date}T12:00:00`);
      if (periodMode === "month" && (date.getMonth() + 1 !== month || date.getFullYear() !== year)) return false;
      if (periodMode === "year" && date.getFullYear() !== year) return false;
      if (periodMode === "student_all" && studentFilter === "all") return false;
      if (studentFilter !== "all" && row.student_name !== studentFilter) return false;
      if (statusFilter !== "all" && row.payment_status !== statusFilter) return false;
      return true;
    });
  }, [rows, periodMode, month, year, studentFilter, statusFilter]);

  const clayMaterials = useMemo(
    () => (materials as any[]).filter((item) => String(item.material_type || "").toLowerCase().includes("argila") || String(item.name).toLowerCase().includes("argila")),
    [materials],
  );
  const glazeMaterials = useMemo(
    () => (materials as any[]).filter((item) => String(item.material_type || "").toLowerCase().includes("esmalte") || String(item.name).toLowerCase().includes("esmalte")),
    [materials],
  );

  const calculation = useMemo(() => {
    const clay = (materials as any[]).find((item) => item.name === form.clay_type);
    const glaze = (materials as any[]).find((item) => item.name === form.glaze_name);
    const clayPerKg = clay
      ? String(clay.unit || "").toLowerCase().includes("g") && !String(clay.unit || "").toLowerCase().includes("kg")
        ? Number(clay.unit_cost || 0) * 1000
        : Number(clay.unit_cost || 0)
      : 7.7;
    const glazePerGram = glaze
      ? String(glaze.unit || "").toLowerCase().includes("kg")
        ? Number(glaze.unit_cost || 0) / 1000
        : Number(glaze.unit_cost || 0)
      : 1;
    return calculateClassPieceCost({
      quantity: n(form.quantity),
      clayWeightKg: n(form.clay_weight_kg),
      clayUnitCost: clayPerKg,
      glazeAmount: n(form.glaze_quantity),
      glazeUnitCost: glazePerGram,
      lengthCm: n(form.length_cm),
      depthCm: n(form.depth_cm),
      glazeCone: form.glaze_cone,
      firingSettings,
      chargeBisque: form.charge_biscuit,
      chargeGlaze: form.charge_glaze,
      kilnFiringProfitRate: Number(classSettings?.kiln_firing_profit_percent ?? 100) / 100,
      otherCosts: n(form.other_cost),
      marginRate: Number(classSettings?.margin_percent ?? 0) / 100,
    });
  }, [form, materials, firingSettings, classSettings]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, row: any) => {
          const charged = Number(row.amount_charged || 0);
          const paid = row.amount_paid != null
            ? Number(row.amount_paid || 0)
            : row.payment_status === "paid"
              ? charged
              : 0;
          const pending = row.amount_pending != null
            ? Number(row.amount_pending || 0)
            : Math.max(0, charged - paid);
          acc.cost += Number(row.total_cost || 0);
          acc.charged += charged;
          acc.paid += paid;
          acc.pending += pending;
          acc.pieces += Number(row.quantity || 1);
          return acc;
        },
        { cost: 0, charged: 0, paid: 0, pending: 0, pieces: 0 },
      ),
    [filtered],
  );
  const byStudent = useMemo(() => {
    const map = new Map<string, any>();
    for (const student of students as any[]) {
      if (studentFilter !== "all" && student.name !== studentFilter) continue;
      map.set(student.name, {
        student: student.name,
        group: student.class_name || "",
        monthlyFee: Number(student.monthly_fee || classSettings?.fixed_monthly_fee || 0),
        pieces: 0,
        cost: 0,
        charged: 0,
        paid: 0,
        pending: 0,
      });
    }
    for (const row of filtered as any[]) {
      const item = map.get(row.student_name) ?? {
        student: row.student_name,
        group: "",
        monthlyFee: Number(classSettings?.fixed_monthly_fee || 0),
        pieces: 0,
        cost: 0,
        charged: 0,
        paid: 0,
        pending: 0,
      };
      const charged = Number(row.amount_charged || 0);
      const paid = Number(row.amount_paid ?? (row.payment_status === "paid" ? charged : 0));
      item.pieces += Number(row.quantity || 1);
      item.cost += Number(row.total_cost || 0);
      item.charged += charged;
      item.paid += paid;
      item.pending += Math.max(0, Number(row.amount_pending ?? charged - paid));
      map.set(row.student_name, item);
    }
    return [...map.values()].sort((a, b) => b.pending - a.pending || a.student.localeCompare(b.student, "pt-BR"));
  }, [filtered, students, studentFilter, classSettings]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.student_name) throw new Error("Selecione o aluno.");
      if (!form.piece_name.trim()) throw new Error("Informe o nome da peça.");
      const chargedInput = form.amount_charged.trim() ? parseLocaleAmount(form.amount_charged) : calculation.chargeAmount;
      if (!Number.isFinite(chargedInput) || chargedInput < 0) throw new Error("Valor cobrado inválido.");
      const paidInput = form.payment_status === "paid"
        ? chargedInput
        : form.payment_status === "waived" || form.payment_status === "pending"
          ? 0
          : n(form.amount_paid);
      const pending = form.payment_status === "waived" ? 0 : Math.max(0, chargedInput - paidInput);
      const payload = {
        workspace_id: wsId,
        usage_date: form.usage_date,
        student_name: form.student_name,
        piece_name: form.piece_name.trim(),
        quantity: Math.max(1, Math.round(n(form.quantity))),
        material: form.clay_type || form.glaze_name || "Peça cerâmica",
        grams: n(form.clay_weight_kg) * 1000,
        clay_weight_kg: n(form.clay_weight_kg),
        clay_type: form.clay_type || null,
        clay_cost: calculation.clayCost,
        length_cm: n(form.length_cm),
        depth_cm: n(form.depth_cm),
        height_cm: n(form.height_cm),
        glaze_cone: form.glaze_cone || null,
        glaze_name: form.glaze_name || null,
        glaze_quantity: n(form.glaze_quantity),
        glaze_cost: calculation.glazeCost,
        biscuit_firing_cost: calculation.bisqueBillingCost,
        glaze_firing_cost: calculation.glazeBillingCost,
        other_cost: calculation.otherCosts,
        total_cost: calculation.totalCost,
        charge_biscuit: form.charge_biscuit,
        charge_glaze: form.charge_glaze,
        amount_charged: chargedInput,
        amount_paid: paidInput,
        amount_pending: pending,
        payment_status: form.payment_status,
        payment_date:
          paidInput > 0 ? form.payment_date || new Date().toISOString().slice(0, 10) : null,
        payment_notes: form.payment_notes.trim() || null,
        comments: form.comments.trim() || null,
      };
      const { error } = editId
        ? await sb
            .from("class_materials_usage")
            .update(payload)
            .eq("id", editId)
            .eq("workspace_id", wsId)
        : await sb.from("class_materials_usage").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_materials_usage"] });
      setOpen(false);
      setEditId(null);
      setForm(empty());
      toast.success("Peça e cobrança salvas");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("class_materials_usage")
        .delete()
        .eq("id", id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class_materials_usage"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const markPaid = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await sb
        .from("class_materials_usage")
        .update({
          payment_status: "paid",
          payment_date: new Date().toISOString().slice(0, 10),
          amount_paid: Number(row.amount_charged || 0),
          amount_pending: 0,
        })
        .eq("id", row.id)
        .eq("workspace_id", wsId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["class_materials_usage"] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const saveSettings = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("class_material_settings").upsert({
        workspace_id: wsId,
        margin_percent: n(settingsForm.margin_percent),
        fixed_monthly_fee: n(settingsForm.fixed_monthly_fee),
        kiln_firing_profit_percent: n(settingsForm.kiln_firing_profit_percent),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_material_settings"] });
      setSettingsOpen(false);
      toast.success("Parâmetros salvos");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function edit(row: any) {
    setEditId(row.id);
    setForm({
      usage_date: row.usage_date,
      student_name: row.student_name,
      piece_name: row.piece_name ?? "",
      quantity: String(row.quantity ?? 1),
      clay_weight_kg: String(row.clay_weight_kg ?? Number(row.grams || 0) / 1000),
      clay_type: row.clay_type ?? row.material ?? "",
      length_cm: String(row.length_cm ?? 0),
      depth_cm: String(row.depth_cm ?? 0),
      height_cm: String(row.height_cm ?? 0),
      glaze_cone: row.glaze_cone ?? "6",
      glaze_name: row.glaze_name ?? "",
      glaze_quantity: String(row.glaze_quantity ?? 0),
      other_cost: String(row.other_cost ?? 0),
      charge_biscuit: row.charge_biscuit !== false,
      charge_glaze: row.charge_glaze !== false,
      amount_charged: String(row.amount_charged ?? ""),
      amount_paid: String(row.amount_paid ?? 0),
      payment_status: row.payment_status ?? "pending",
      payment_date: row.payment_date ?? "",
      payment_notes: row.payment_notes ?? "",
      comments: row.comments ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Material Aulas Regulares"
        description="Custo completo da peça, cobrança e acompanhamento por aluno"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" />Parâmetros
            </Button>
            <Button onClick={() => { setEditId(null); setForm(empty()); setOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />Nova peça
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-2 p-3">
          <Select value={periodMode} onValueChange={setPeriodMode}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Mês selecionado</SelectItem>
              <SelectItem value="year">Ano inteiro</SelectItem>
              <SelectItem value="student_all">Histórico do aluno</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 12 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>{monthLabel(index + 1)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1].map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os alunos</SelectItem>{students.map((student: any) => <SelectItem key={student.id} value={student.name}>{student.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="partial">Parcial</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="waived">Cortesia</SelectItem></SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Peças" value={String(totals.pieces)} />
        <Stat label="Custo interno" value={formatCurrency(totals.cost, currency, privacy)} />
        <Stat label="Total cobrado" value={formatCurrency(totals.charged, currency, privacy)} />
        <Stat label="Pago" value={formatCurrency(totals.paid, currency, privacy)} tone="income" />
        <Stat label="A receber" value={formatCurrency(totals.pending, currency, privacy)} tone="expense" />
        <Stat label="Alunos" value={String(byStudent.length)} />
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Resumo por aluno</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Aluno</th><th className="p-3">Turma</th><th className="p-3">Peças</th><th className="p-3 text-right">Custo</th><th className="p-3 text-right">Materiais</th><th className="p-3 text-right">A receber</th><th className="p-3 text-right">Mensalidade + materiais</th></tr></thead>
            <tbody>{byStudent.map((item) => <tr key={item.student} className="border-t"><td className="p-3 font-medium">{item.student}</td><td className="p-3">{item.group || "—"}</td><td className="p-3">{item.pieces}</td><td className="p-3 text-right font-mono">{formatCurrency(item.cost, currency, privacy)}</td><td className="p-3 text-right font-mono">{formatCurrency(item.charged, currency, privacy)}</td><td className="p-3 text-right font-mono text-expense">{formatCurrency(item.pending, currency, privacy)}</td><td className="p-3 text-right font-mono">{formatCurrency(item.monthlyFee + item.charged, currency, privacy)}</td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Sem registros neste período" />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Peças e cobranças</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Data</th><th className="p-3">Aluno</th><th className="p-3">Peça</th><th className="p-3">Materiais</th><th className="p-3 text-right">Custo</th><th className="p-3 text-right">Cobrança</th><th className="p-3 text-right">Pendente</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
              <tbody>{filtered.map((row: any) => <tr key={row.id} className="border-t"><td className="p-3 font-mono">{row.usage_date}</td><td className="p-3 font-medium">{row.student_name}</td><td className="p-3">{row.piece_name || "—"}<div className="text-xs text-muted-foreground">{row.quantity ?? 1} un.</div></td><td className="p-3 text-xs">{row.clay_type || "—"}<br />{row.glaze_name || "—"}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(row.total_cost || 0), currency, privacy)}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(row.amount_charged || 0), currency, privacy)}</td><td className="p-3 text-right font-mono text-expense">{formatCurrency(Number(row.amount_pending ?? Math.max(0, Number(row.amount_charged || 0) - Number(row.amount_paid || 0))), currency, privacy)}</td><td className="p-3">{statusLabel(row.payment_status)}</td><td className="p-3"><div className="flex justify-end gap-1">{row.payment_status !== "paid" && row.payment_status !== "waived" && <Button variant="outline" size="sm" onClick={() => markPaid.mutate(row)}>Marcar pago</Button>}<Button variant="ghost" size="icon" onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editId ? "Editar peça" : "Nova peça/material"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Data"><Input type="date" value={form.usage_date} onChange={(event) => setForm({ ...form, usage_date: event.target.value })} /></Field>
            <Field label="Aluno"><Select value={form.student_name || "none"} onValueChange={(value) => setForm({ ...form, student_name: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{students.map((student: any) => <SelectItem key={student.id} value={student.name}>{student.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Peça"><Input value={form.piece_name} onChange={(event) => setForm({ ...form, piece_name: event.target.value })} /></Field>
            <Field label="Quantidade"><Input type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
            <Field label="Argila (kg)"><Input inputMode="decimal" value={form.clay_weight_kg} onChange={(event) => setForm({ ...form, clay_weight_kg: event.target.value })} /></Field>
            <Field label="Tipo de argila"><Select value={form.clay_type || "none"} onValueChange={(value) => setForm({ ...form, clay_type: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{clayMaterials.map((material: any) => <SelectItem key={material.id} value={material.name}>{material.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Comprimento (cm)"><Input value={form.length_cm} onChange={(event) => setForm({ ...form, length_cm: event.target.value })} /></Field>
            <Field label="Profundidade (cm)"><Input value={form.depth_cm} onChange={(event) => setForm({ ...form, depth_cm: event.target.value })} /></Field>
            <Field label="Altura (cm)"><Input value={form.height_cm} onChange={(event) => setForm({ ...form, height_cm: event.target.value })} /></Field>
            <Field label="Cone do esmalte"><Input value={form.glaze_cone} onChange={(event) => setForm({ ...form, glaze_cone: event.target.value })} /></Field>
            <Field label="Esmalte"><Select value={form.glaze_name || "none"} onValueChange={(value) => setForm({ ...form, glaze_name: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{glazeMaterials.map((material: any) => <SelectItem key={material.id} value={material.name}>{material.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Quantidade de esmalte"><Input inputMode="decimal" value={form.glaze_quantity} onChange={(event) => setForm({ ...form, glaze_quantity: event.target.value })} /></Field>
            <Field label="Outros custos"><Input inputMode="decimal" value={form.other_cost} onChange={(event) => setForm({ ...form, other_cost: event.target.value })} /></Field>
            <div className="flex items-center gap-2 pt-6"><Switch checked={form.charge_biscuit} onCheckedChange={(value) => setForm({ ...form, charge_biscuit: value })} /><Label>Cobrar biscoito</Label></div>
            <div className="flex items-center gap-2 pt-6"><Switch checked={form.charge_glaze} onCheckedChange={(value) => setForm({ ...form, charge_glaze: value })} /><Label>Cobrar esmaltação</Label></div>
          </div>
          <Card><CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 p-4 text-sm md:grid-cols-3"><Cost label="Argila" value={calculation.clayCost} currency={currency} privacy={privacy} /><Cost label="Esmalte" value={calculation.glazeCost} currency={currency} privacy={privacy} /><Cost label="Biscoito" value={calculation.bisqueBillingCost} currency={currency} privacy={privacy} /><Cost label="Queima esmalte" value={calculation.glazeBillingCost} currency={currency} privacy={privacy} /><Cost label="Custo total" value={calculation.totalCost} currency={currency} privacy={privacy} /><Cost label="Cobrança sugerida" value={calculation.chargeAmount} currency={currency} privacy={privacy} /></CardContent></Card>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Valor cobrado"><div className="flex gap-2"><Input inputMode="decimal" placeholder={calculation.chargeAmount.toFixed(2)} value={form.amount_charged} onChange={(event) => setForm({ ...form, amount_charged: event.target.value })} /><Button type="button" variant="outline" onClick={() => setForm({ ...form, amount_charged: calculation.chargeAmount.toFixed(2) })}>Usar</Button></div></Field>
            <Field label="Status"><Select value={form.payment_status} onValueChange={(value) => setForm({ ...form, payment_status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="partial">Parcial</SelectItem><SelectItem value="paid">Pago</SelectItem><SelectItem value="waived">Cortesia</SelectItem></SelectContent></Select></Field>
            <Field label="Valor pago"><Input inputMode="decimal" value={form.amount_paid} onChange={(event) => setForm({ ...form, amount_paid: event.target.value })} disabled={form.payment_status !== "partial"} /></Field>
            <Field label="Data do pagamento"><Input type="date" value={form.payment_date} onChange={(event) => setForm({ ...form, payment_date: event.target.value })} /></Field>
            <Field label="Notas do pagamento"><Input value={form.payment_notes} onChange={(event) => setForm({ ...form, payment_notes: event.target.value })} /></Field>
            <Field label="Comentários"><Input value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}><Package className="mr-1 h-4 w-4" />Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Parâmetros de cobrança</DialogTitle></DialogHeader><div className="space-y-3"><Field label="Margem sobre materiais (%)"><Input value={settingsForm.margin_percent} onChange={(event) => setSettingsForm({ ...settingsForm, margin_percent: event.target.value })} /></Field><Field label="Mensalidade padrão"><Input value={settingsForm.fixed_monthly_fee} onChange={(event) => setSettingsForm({ ...settingsForm, fixed_monthly_fee: event.target.value })} /></Field><Field label="Lucro sobre as queimas (%)"><Input value={settingsForm.kiln_firing_profit_percent} onChange={(event) => setSettingsForm({ ...settingsForm, kiln_firing_profit_percent: event.target.value })} /></Field></div><DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancelar</Button><Button onClick={() => saveSettings.mutate()}>Salvar</Button></DialogFooter></DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function statusLabel(value: string) {
  return value === "paid" ? "Pago" : value === "partial" ? "Parcial" : value === "waived" ? "Cortesia" : "Pendente";
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) {
  return <Card><CardContent className="p-4"><div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div><div className={`mt-1 font-mono text-xl ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>{value}</div></CardContent></Card>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function Cost({ label, value, currency, privacy }: { label: string; value: number; currency: string; privacy: boolean }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="font-mono">{formatCurrency(value, currency, privacy)}</span></div>;
}
