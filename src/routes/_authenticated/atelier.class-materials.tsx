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
import { formatCurrency, formatDate, monthLabel, parseLocaleAmount } from "@/lib/format";
import { calculateClassPieceCost } from "@/lib/orna-logic";
import { Calculator, Camera, ImagePlus, Package, Pencil, Plus, Printer, Settings2, Trash2, Users, X } from "lucide-react";
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
  kiln_id: "",
  piece_name: "",
  production_status: "in_progress",
  completed_at: "",
  quantity: "1",
  clay_weight_g: "0",
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
  resistance_only: false,
  amount_charged: "",
  amount_paid: "0",
  payment_status: "pending",
  payment_date: "",
  payment_notes: "",
  comments: "",
  photo_path: "",
  photo_url: "",
});

const PHOTO_BUCKET = "class-piece-photos";
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function photoExtension(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return byType[file.type] ?? "jpg";
}

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
  const [printStudent, setPrintStudent] = useState<string | null>(null);
  const [reportPhotosByStudent, setReportPhotosByStudent] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(empty());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
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
      const result = data ?? [];
      const paths = [...new Set(result.map((row: { photo_path?: string | null }) => row.photo_path).filter(Boolean))] as string[];
      if (paths.length === 0) return result;
      const { data: signedPhotos, error: signedPhotosError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      if (signedPhotosError) throw signedPhotosError;
      const signedByPath = new Map((signedPhotos ?? []).map((photo) => [photo.path, photo.signedUrl]));
      return result.map((row: { photo_path?: string | null }) => ({
        ...row,
        photo_url: row.photo_path ? signedByPath.get(row.photo_path) ?? "" : "",
      }));
    },
  });

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(form.photo_url);
      return;
    }
    const previewUrl = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photoFile, form.photo_url]);

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      toast.error("Use uma foto JPG, PNG, WebP, HEIC ou HEIF.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      toast.error("A foto deve ter no máximo 10 MB.");
      return;
    }
    setPhotoFile(file);
  }

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

  useEffect(() => {
    if (!printStudent) return;
    document.body.classList.add("printing-student-materials");
    let cancelled = false;
    const finish = () => {
      document.body.classList.remove("printing-student-materials");
      setPrintStudent(null);
    };
    window.addEventListener("afterprint", finish, { once: true });
    const timer = window.setTimeout(async () => {
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>(
          '[data-print-statement="selected"] img[data-report-piece-photo="true"]',
        ),
      );
      await Promise.race([
        Promise.all(
          images.map(
            (image) =>
              image.complete
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    image.addEventListener("load", () => resolve(), { once: true });
                    image.addEventListener("error", () => resolve(), { once: true });
                  }),
          ),
        ),
        new Promise((resolve) => window.setTimeout(resolve, 3000)),
      ]);
      if (!cancelled) window.print();
    }, 100);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove("printing-student-materials");
    };
  }, [printStudent]);

  const { data: firingSettings } = useQuery({
    queryKey: ["firing_settings", wsId, "class-materials"],
    enabled: !!wsId,
    queryFn: async () =>
      (await sb.from("firing_settings").select("*").eq("workspace_id", wsId).maybeSingle()).data ?? null,
  });
  const { data: kilns = [] } = useQuery({
    queryKey: ["kilns", wsId, "class-materials"],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("kilns")
        .select("*")
        .eq("workspace_id", wsId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const selectedKiln = useMemo(
    () =>
      (kilns as any[]).find((kiln) => kiln.id === form.kiln_id) ??
      (kilns as any[]).find((kiln) => kiln.is_default) ??
      (kilns as any[])[0] ??
      firingSettings,
    [kilns, form.kiln_id, firingSettings],
  );

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
      clayWeightKg: n(form.clay_weight_g) / 1000,
      clayUnitCost: clayPerKg,
      glazeAmount: n(form.glaze_quantity),
      glazeUnitCost: glazePerGram,
      lengthCm: n(form.length_cm),
      depthCm: n(form.depth_cm),
      glazeCone: form.glaze_cone,
      firingSettings: selectedKiln,
      chargeBisque: form.charge_biscuit,
      chargeGlaze: form.charge_glaze,
      resistanceOnly: form.resistance_only,
      kilnFiringProfitRate: Number(classSettings?.kiln_firing_profit_percent ?? 100) / 100,
      otherCosts: n(form.other_cost),
      marginRate: Number(classSettings?.margin_percent ?? 0) / 100,
      freightRate: 0.1,
    });
  }, [form, materials, selectedKiln, classSettings]);

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

  const studentStatements = useMemo(() => {
    const map = new Map<string, any>();
    for (const row of filtered as any[]) {
      const quantity = Math.max(1, Number(row.quantity || 1));
      const clay = Number(row.clay_cost || 0) * quantity;
      const glaze = Number(row.glaze_cost || 0) * quantity;
      const firing =
        (Number(row.biscuit_firing_cost || 0) + Number(row.glaze_firing_cost || 0)) *
        quantity;
      const other = Number(row.other_cost || 0) * quantity;
      const unitBase =
        Number(row.clay_cost || 0) +
        Number(row.glaze_cost || 0) +
        Number(row.biscuit_firing_cost || 0) +
        Number(row.glaze_firing_cost || 0) +
        Number(row.other_cost || 0);
      const freightRate = Number(row.freight_rate ?? 0.1);
      const savedFreight = Number(row.freight_cost || 0);
      const freightPerUnit = savedFreight > 0 ? savedFreight : unitBase * freightRate;
      const freight = freightPerUnit * quantity;
      const calculated = clay + glaze + firing + other + freight;
      const charged = Number(row.amount_charged ?? calculated);
      const paid = Number(
        row.amount_paid ?? (row.payment_status === "paid" ? charged : 0),
      );
      const pending = Math.max(0, Number(row.amount_pending ?? charged - paid));
      const piece = {
        ...row,
        quantity,
        clay,
        glaze,
        firing,
        other,
        freight,
        freightRate,
        calculated,
        charged,
        paid,
        pending,
      };
      const item = map.get(row.student_name) ?? {
        student: row.student_name,
        group:
          (students as any[]).find((student) => student.name === row.student_name)?.class_name ||
          "",
        quantity: 0,
        clay: 0,
        glaze: 0,
        firing: 0,
        other: 0,
        freight: 0,
        calculated: 0,
        charged: 0,
        paid: 0,
        pending: 0,
        pieces: [],
      };
      item.quantity += quantity;
      item.clay += clay;
      item.glaze += glaze;
      item.firing += firing;
      item.other += other;
      item.freight += freight;
      item.calculated += calculated;
      item.charged += charged;
      item.paid += paid;
      item.pending += pending;
      item.pieces.push(piece);
      map.set(row.student_name, item);
    }
    return [...map.values()].sort((a, b) =>
      a.student.localeCompare(b.student, "pt-BR"),
    );
  }, [filtered, students]);

  const save = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error("Selecione um workspace.");
      if (!form.student_name) throw new Error("Selecione o aluno.");
      if (!form.piece_name.trim()) throw new Error("Informe o nome da peça.");
      if ((kilns as any[]).length > 0 && !selectedKiln?.id) throw new Error("Selecione o forno.");
      const clayWeightGrams = n(form.clay_weight_g);
      if (clayWeightGrams < 0) throw new Error("A quantidade de argila não pode ser negativa.");
      const chargedInput = form.amount_charged.trim() ? parseLocaleAmount(form.amount_charged) : calculation.chargeAmount;
      if (!Number.isFinite(chargedInput) || chargedInput < 0) throw new Error("Valor cobrado inválido.");
      const paidInput = form.payment_status === "paid"
        ? chargedInput
        : form.payment_status === "waived" || form.payment_status === "pending"
          ? 0
          : n(form.amount_paid);
      const pending = form.payment_status === "waived" ? 0 : Math.max(0, chargedInput - paidInput);
      let photoPath = form.photo_path || null;
      let uploadedPhotoPath: string | null = null;
      if (photoFile) {
        if (!ALLOWED_PHOTO_TYPES.has(photoFile.type)) throw new Error("Use uma foto JPG, PNG, WebP, HEIC ou HEIF.");
        if (photoFile.size > MAX_PHOTO_SIZE) throw new Error("A foto deve ter no máximo 10 MB.");
        uploadedPhotoPath = `${wsId}/${crypto.randomUUID()}.${photoExtension(photoFile)}`;
        const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(uploadedPhotoPath, photoFile, {
          upsert: false,
          contentType: photoFile.type,
        });
        if (uploadError) throw uploadError;
        photoPath = uploadedPhotoPath;
      }
      const payload = {
        workspace_id: wsId,
        usage_date: form.usage_date,
        student_name: form.student_name,
        student_id: (students as any[]).find((student) => student.name === form.student_name)?.id ?? null,
        kiln_id: selectedKiln?.id ?? null,
        piece_name: form.piece_name.trim(),
        production_status: form.production_status,
        completed_at:
          ["completed", "delivered"].includes(form.production_status)
            ? form.completed_at || new Date().toISOString().slice(0, 10)
            : null,
        quantity: Math.max(1, Math.round(n(form.quantity))),
        material: form.clay_type || form.glaze_name || "Peça cerâmica",
        grams: clayWeightGrams,
        clay_weight_kg: clayWeightGrams / 1000,
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
        resistance_only: form.resistance_only,
        freight_rate: calculation.freightRate,
        freight_cost: calculation.freightCost,
        amount_charged: chargedInput,
        amount_paid: paidInput,
        amount_pending: pending,
        payment_status: form.payment_status,
        payment_date:
          paidInput > 0 ? form.payment_date || new Date().toISOString().slice(0, 10) : null,
        payment_notes: form.payment_notes.trim() || null,
        comments: form.comments.trim() || null,
        photo_path: photoPath,
      };
      const { error } = editId
        ? await sb
            .from("class_materials_usage")
            .update(payload)
            .eq("id", editId)
            .eq("workspace_id", wsId)
        : await sb.from("class_materials_usage").insert(payload);
      if (error) {
        if (uploadedPhotoPath) await supabase.storage.from(PHOTO_BUCKET).remove([uploadedPhotoPath]);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class_materials_usage"] });
      setOpen(false);
      setEditId(null);
      setForm(empty());
      setPhotoFile(null);
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
    setPhotoFile(null);
    setForm({
      usage_date: row.usage_date,
      student_name: row.student_name,
      kiln_id: row.kiln_id ?? "",
      piece_name: row.piece_name ?? "",
      production_status: row.production_status ?? "in_progress",
      completed_at: row.completed_at ?? "",
      quantity: String(row.quantity ?? 1),
      clay_weight_g: String(
        row.grams != null
          ? Number(row.grams || 0)
          : Number(row.clay_weight_kg || 0) * 1000,
      ),
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
      resistance_only: row.resistance_only === true,
      amount_charged: String(row.amount_charged ?? ""),
      amount_paid: String(row.amount_paid ?? 0),
      payment_status: row.payment_status ?? "pending",
      payment_date: row.payment_date ?? "",
      payment_notes: row.payment_notes ?? "",
      comments: row.comments ?? "",
      photo_path: row.photo_path ?? "",
      photo_url: row.photo_url ?? "",
    });
    setOpen(true);
  }

  return (
    <PageContainer>
      <style>{`@media print {
        body.printing-student-materials * { visibility: hidden !important; }
        body.printing-student-materials [data-print-statement="selected"],
        body.printing-student-materials [data-print-statement="selected"] * { visibility: visible !important; }
        body.printing-student-materials [data-print-statement="selected"] {
          position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important;
          box-shadow: none !important; border: 0 !important; background: white !important;
        }
        body.printing-student-materials [data-print-hide="true"] { display: none !important; }
      }`}</style>
      <PageHeader
        title="Material Aulas Regulares"
        helpKey="atelier.class-materials"
        description="Custo completo da peça, cobrança e acompanhamento por aluno"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" />Parâmetros
            </Button>
            <Button onClick={() => { setEditId(null); setPhotoFile(null); setForm(empty()); setOpen(true); }}>
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

      {studentStatements.length > 0 && (
        <section className="mb-4 space-y-4" aria-labelledby="student-statements-title">
          <div>
            <h2 id="student-statements-title" className="text-lg font-semibold">Demonstrativos de materiais por aluno</h2>
            <p className="text-sm text-muted-foreground">Visão executiva pronta para imprimir ou salvar em PDF e enviar ao aluno.</p>
          </div>
          {studentStatements.map((item) => (
            <StudentStatement
              key={item.student}
              item={item}
              period={periodMode === "month" ? `${monthLabel(month)} de ${year}` : periodMode === "year" ? String(year) : "Histórico completo"}
              currency={currency}
              privacy={privacy}
              selectedForPrint={printStudent === item.student}
              includePhotos={reportPhotosByStudent[item.student] ?? false}
              onIncludePhotosChange={(includePhotos) =>
                setReportPhotosByStudent((current) => ({ ...current, [item.student]: includePhotos }))
              }
              onPrint={() => setPrintStudent(item.student)}
            />
          ))}
        </section>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Sem registros neste período" />
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Peças e cobranças</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm"><thead className="bg-muted/40"><tr className="text-left"><th className="p-3">Data</th><th className="p-3">Aluno</th><th className="p-3">Peça</th><th className="p-3">Produção</th><th className="p-3">Forno</th><th className="p-3">Materiais</th><th className="p-3 text-right">Custo</th><th className="p-3 text-right">Cobrança</th><th className="p-3 text-right">Pendente</th><th className="p-3">Pagamento</th><th className="p-3" /></tr></thead>
              <tbody>{filtered.map((row: any) => <tr key={row.id} className="border-t"><td className="p-3 font-mono">{row.usage_date}</td><td className="p-3 font-medium">{row.student_name}</td><td className="p-3"><div className="flex min-w-44 items-center gap-3">{row.photo_url ? <img src={row.photo_url} alt={`Foto de ${row.piece_name || "peça"}`} className="h-12 w-12 rounded-lg border object-cover" loading="lazy" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground"><ImagePlus className="h-5 w-5" /></div>}<div>{row.piece_name || "—"}<div className="text-xs text-muted-foreground">{row.quantity ?? 1} un.</div></div></div></td><td className="p-3">{productionLabel(row.production_status)}</td><td className="p-3">{(kilns as any[]).find((kiln) => kiln.id === row.kiln_id)?.name || "Padrão legado"}</td><td className="p-3 text-xs">{row.clay_type || "—"}<br />{row.glaze_name || "—"}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(row.total_cost || 0), currency, privacy)}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(row.amount_charged || 0), currency, privacy)}</td><td className="p-3 text-right font-mono text-expense">{formatCurrency(Number(row.amount_pending ?? Math.max(0, Number(row.amount_charged || 0) - Number(row.amount_paid || 0))), currency, privacy)}</td><td className="p-3">{statusLabel(row.payment_status)}</td><td className="p-3"><div className="flex justify-end gap-1">{row.payment_status !== "paid" && row.payment_status !== "waived" && <Button variant="outline" size="sm" onClick={() => markPaid.mutate(row)}>Marcar pago</Button>}<Button variant="ghost" size="icon" onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => remove.mutate(row.id)}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setPhotoFile(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editId ? "Editar peça" : "Nova peça/material"}</DialogTitle></DialogHeader>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {photoPreviewUrl ? <img src={photoPreviewUrl} alt="Prévia da foto da peça" className="h-28 w-28 rounded-xl border bg-background object-cover" /> : <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed bg-background text-muted-foreground"><ImagePlus className="h-8 w-8" /></div>}
              <div className="flex-1 space-y-2">
                <div><Label>Foto da peça</Label><p className="mt-1 text-xs text-muted-foreground">Tire uma foto agora ou escolha uma imagem do aparelho. Máximo de 10 MB.</p></div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" asChild><label htmlFor="piece-camera" className="cursor-pointer"><Camera className="mr-1 h-4 w-4" />Tirar foto</label></Button>
                  <Input id="piece-camera" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="hidden" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  <Button type="button" variant="outline" asChild><label htmlFor="piece-upload" className="cursor-pointer"><ImagePlus className="mr-1 h-4 w-4" />Enviar arquivo</label></Button>
                  <Input id="piece-upload" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(event) => { choosePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                  {photoPreviewUrl && <Button type="button" variant="ghost" onClick={() => { setPhotoFile(null); setForm({ ...form, photo_path: "", photo_url: "" }); }}><X className="mr-1 h-4 w-4" />Remover</Button>}
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Data"><Input type="date" value={form.usage_date} onChange={(event) => setForm({ ...form, usage_date: event.target.value })} /></Field>
            <Field label="Aluno"><Select value={form.student_name || "none"} onValueChange={(value) => setForm({ ...form, student_name: value === "none" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Selecione</SelectItem>{students.map((student: any) => <SelectItem key={student.id} value={student.name}>{student.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Peça"><Input value={form.piece_name} onChange={(event) => setForm({ ...form, piece_name: event.target.value })} /></Field>
            <Field label="Etapa de produção"><Select value={form.production_status} onValueChange={(value) => setForm({ ...form, production_status: value, completed_at: ["completed", "delivered"].includes(value) ? form.completed_at || new Date().toISOString().slice(0, 10) : "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in_progress">Em produção</SelectItem><SelectItem value="drying">Secando</SelectItem><SelectItem value="bisque">Biscoito</SelectItem><SelectItem value="glazing">Esmaltação</SelectItem><SelectItem value="completed">Concluída</SelectItem><SelectItem value="delivered">Entregue</SelectItem></SelectContent></Select></Field>
            <Field label="Forno"><Select value={form.kiln_id || selectedKiln?.id || "legacy"} onValueChange={(value) => setForm({ ...form, kiln_id: value === "legacy" ? "" : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(kilns as any[]).length === 0 && <SelectItem value="legacy">Parâmetros antigos</SelectItem>}{(kilns as any[]).map((kiln) => <SelectItem key={kiln.id} value={kiln.id}>{kiln.name}{kiln.is_default ? " · padrão" : ""}</SelectItem>)}</SelectContent></Select></Field>
            {["completed", "delivered"].includes(form.production_status) && <Field label="Data de conclusão"><Input type="date" value={form.completed_at} onChange={(event) => setForm({ ...form, completed_at: event.target.value })} /></Field>}
            <Field label="Quantidade"><Input type="number" min={1} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
            <Field label="Argila utilizada (gramas)"><Input type="number" min={0} step={1} inputMode="numeric" value={form.clay_weight_g} onChange={(event) => setForm({ ...form, clay_weight_g: event.target.value })} /></Field>
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
            <div className="col-span-2 rounded-xl border bg-muted/30 p-3 md:col-span-3">
              <div className="flex items-start gap-3">
                <Switch checked={form.resistance_only} onCheckedChange={(value) => setForm({ ...form, resistance_only: value })} />
                <div>
                  <Label>Considerar somente o custo das resistências</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Exclui energia e buffer do custo da queima. A ocupação da peça no forno e o percentual de cobrança configurado continuam sendo aplicados.</p>
                </div>
              </div>
            </div>
          </div>
          <Card><CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 p-4 text-sm md:grid-cols-4"><Cost label="Argila" value={calculation.clayCost} currency={currency} privacy={privacy} /><Cost label="Esmalte" value={calculation.glazeCost} currency={currency} privacy={privacy} /><Cost label="Biscoito" value={calculation.bisqueBillingCost} currency={currency} privacy={privacy} /><Cost label="Queima esmalte" value={calculation.glazeBillingCost} currency={currency} privacy={privacy} /><Cost label="Outros" value={calculation.otherCosts} currency={currency} privacy={privacy} /><Cost label="Base da peça" value={calculation.unitBase} currency={currency} privacy={privacy} /><Cost label="Frete (10%)" value={calculation.freightCost} currency={currency} privacy={privacy} /><Cost label="Cobrança sugerida" value={calculation.chargeAmount} currency={currency} privacy={privacy} /></CardContent></Card>
          <Card className="border-dashed">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Calculator className="h-4 w-4" />Memória de cálculo auditável</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Ocupação:</strong> área elíptica da peça com 1 cm de folga em cada lado ÷ área útil do forno = {(calculation.kilnUsePercent * 100).toFixed(3)}%.</p>
              <p><strong className="text-foreground">Biscoito — resistência:</strong> {formatCurrency(calculation.bisqueProfile.resistanceCost, currency, privacy)} ÷ {calculation.bisqueProfile.resistanceBurns} queimas × ocupação = {formatCurrency(calculation.bisqueResistanceCost, currency, privacy)}.</p>
              <p><strong className="text-foreground">Esmalte — resistência:</strong> {formatCurrency(calculation.glazeProfile.resistanceCost, currency, privacy)} ÷ {calculation.glazeProfile.resistanceBurns} queimas × ocupação = {formatCurrency(calculation.glazeResistanceCost, currency, privacy)}.</p>
              {!calculation.resistanceOnly && <p><strong className="text-foreground">Modo completo:</strong> soma energia ({formatCurrency(calculation.bisqueEnergyCost + calculation.glazeEnergyCost, currency, privacy)}), resistências e buffer ({formatCurrency(calculation.bisqueBufferCost + calculation.glazeBufferCost, currency, privacy)}).</p>}
              {calculation.resistanceOnly && <p><strong className="text-foreground">Modo selecionado:</strong> somente a parcela das resistências entra na base das queimas; energia e buffer são R$ 0,00 para esta cobrança.</p>}
              <p><strong className="text-foreground">Cobrança das queimas:</strong> custo selecionado × (1 + {Number(classSettings?.kiln_firing_profit_percent ?? 100).toFixed(0)}%). <strong className="text-foreground">Frete:</strong> base da peça × 10% = {formatCurrency(calculation.freightCost, currency, privacy)} por unidade.</p>
            </CardContent>
          </Card>
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

function StudentStatement({
  item,
  period,
  currency,
  privacy,
  selectedForPrint,
  includePhotos,
  onIncludePhotosChange,
  onPrint,
}: {
  item: any;
  period: string;
  currency: string;
  privacy: boolean;
  selectedForPrint: boolean;
  includePhotos: boolean;
  onIncludePhotosChange: (includePhotos: boolean) => void;
  onPrint: () => void;
}) {
  const photoCount = item.pieces.filter((piece: any) => Boolean(piece.photo_url)).length;
  return (
    <Card data-print-statement={selectedForPrint ? "selected" : "idle"} className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{item.student}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{item.group || "Aulas regulares"} · {period} · {item.quantity} {item.quantity === 1 ? "peça" : "peças"}</p>
          </div>
          <div data-print-hide="true" className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <Switch
                checked={includePhotos}
                disabled={photoCount === 0}
                onCheckedChange={onIncludePhotosChange}
                aria-label="Incluir fotos das peças no relatório"
              />
              <span className="text-sm">
                {photoCount > 0 ? `Incluir fotos das peças (${photoCount})` : "Nenhuma foto cadastrada"}
              </span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onPrint}>
              <Printer className="mr-1 h-4 w-4" />Imprimir / salvar PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-primary p-4 text-primary-foreground">
            <div className="text-xs uppercase tracking-wide opacity-80">Total de materiais</div>
            <div className="mt-1 font-mono text-2xl font-bold">{formatCurrency(item.charged, currency, privacy)}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Já pago</div>
            <div className="mt-1 font-mono text-2xl font-bold text-income">{formatCurrency(item.paid, currency, privacy)}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Falta pagar</div>
            <div className="mt-1 font-mono text-2xl font-bold text-expense">{formatCurrency(item.pending, currency, privacy)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Breakdown label="Argila" value={item.clay} currency={currency} privacy={privacy} />
          <Breakdown label="Esmalte" value={item.glaze} currency={currency} privacy={privacy} />
          <Breakdown label="Queimas" value={item.firing} currency={currency} privacy={privacy} />
          <Breakdown label="Outros custos" value={item.other} currency={currency} privacy={privacy} />
          <Breakdown label="Frete (10%)" value={item.freight} currency={currency} privacy={privacy} />
        </div>

        <div className="space-y-3">
          {item.pieces.map((piece: any) => {
            const unitCalculated = piece.calculated / piece.quantity;
            return (
              <div key={piece.id} className="break-inside-avoid rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {includePhotos && piece.photo_url && (
                      <img
                        src={piece.photo_url}
                        alt={`Foto de ${piece.piece_name || "peça"}`}
                        data-report-piece-photo="true"
                        className="h-24 w-24 shrink-0 rounded-lg border object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{piece.piece_name || "Peça sem nome"}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${piece.payment_status === "paid" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"}`}>{statusLabel(piece.payment_status)}</span>
                        {piece.resistance_only && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Somente resistências</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(piece.usage_date)} · {piece.quantity} {piece.quantity === 1 ? "unidade" : "unidades"} · {Number(piece.clay_weight_kg || 0) * 1000} g de {piece.clay_type || "argila"} · Cone {piece.glaze_cone || "—"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Custo calculado por peça</div>
                    <div className="font-mono text-xl font-bold text-primary">{formatCurrency(unitCalculated, currency, privacy)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-2 py-3 text-sm md:grid-cols-5">
                  <Cost label="Argila" value={piece.clay / piece.quantity} currency={currency} privacy={privacy} />
                  <Cost label="Esmalte" value={piece.glaze / piece.quantity} currency={currency} privacy={privacy} />
                  <Cost label="Queimas" value={piece.firing / piece.quantity} currency={currency} privacy={privacy} />
                  <Cost label="Outros" value={piece.other / piece.quantity} currency={currency} privacy={privacy} />
                  <Cost label={`Frete (${(piece.freightRate * 100).toFixed(0)}%)`} value={piece.freight / piece.quantity} currency={currency} privacy={privacy} />
                </div>
                <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Calculado: <strong className="font-mono text-foreground">{formatCurrency(piece.calculated, currency, privacy)}</strong></span>
                  <span className="text-muted-foreground">Cobrado: <strong className="font-mono text-foreground">{formatCurrency(piece.charged, currency, privacy)}</strong></span>
                  <span className="text-muted-foreground">Pago: <strong className="font-mono text-income">{formatCurrency(piece.paid, currency, privacy)}</strong></span>
                  <span className="text-muted-foreground">Pendente: <strong className="font-mono text-expense">{formatCurrency(piece.pending, currency, privacy)}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ label, value, currency, privacy }: { label: string; value: number; currency: string; privacy: boolean }) {
  return <div className="rounded-xl bg-muted/60 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-mono font-semibold">{formatCurrency(value, currency, privacy)}</div></div>;
}

function statusLabel(value: string) {
  return value === "paid" ? "Pago" : value === "partial" ? "Parcial" : value === "waived" ? "Cortesia" : "Pendente";
}
function productionLabel(value: string) {
  return value === "drying"
    ? "Secando"
    : value === "bisque"
      ? "Biscoito"
      : value === "glazing"
        ? "Esmaltação"
        : value === "completed"
          ? "Concluída"
          : value === "delivered"
            ? "Entregue"
            : "Em produção";
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
