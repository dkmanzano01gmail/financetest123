import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Plus, Pencil, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage } from "@/components/student/portal-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/student/projects")({ component: Projects });
const sb = supabase as any;
const empty = {
  title: "",
  description: "",
  piece_type: "",
  clay: "",
  glazes: "",
  desired_dimensions: "",
  reference_image_url: "",
  notes: "",
  status: "ideia",
};

function Projects() {
  const { data: access } = useStudentPortalAccess();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const { data: projects = [] } = useQuery({
    queryKey: ["student-projects", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const result = await sb
        .from("student_projects")
        .select("*")
        .eq("workspace_id", access!.workspace_id)
        .eq("student_id", access!.student_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!access || !form.title.trim()) throw new Error("Informe o título.");
      const payload = {
        workspace_id: access.workspace_id,
        student_id: access.student_id,
        title: form.title.trim(),
        description: form.description || null,
        piece_type: form.piece_type || null,
        clay: form.clay || null,
        glazes: form.glazes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        desired_dimensions: form.desired_dimensions || null,
        reference_image_url: form.reference_image_url || null,
        notes: form.notes || null,
        status: form.status,
      };
      const result = editing
        ? await sb
            .from("student_projects")
            .update(payload)
            .eq("id", editing)
            .eq("student_id", access.student_id)
        : await sb.from("student_projects").insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-projects"] });
      setOpen(false);
      setForm(empty);
      setEditing(null);
      toast.success("Projeto salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const result = await sb
        .from("student_projects")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("student_id", access!.student_id);
      if (result.error) throw result.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student-projects"] }),
  });
  function edit(project: any) {
    setEditing(project.id);
    setForm({
      title: project.title || "",
      description: project.description || "",
      piece_type: project.piece_type || "",
      clay: project.clay || "",
      glazes: (project.glazes || []).join(", "),
      desired_dimensions: project.desired_dimensions || "",
      reference_image_url: project.reference_image_url || "",
      notes: project.notes || "",
      status: project.status || "ideia",
    });
    setOpen(true);
  }
  return (
    <PortalPage
      title="Meus projetos"
      description="Organize as próximas peças que quer criar."
      action={
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm(empty);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Novo
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project: any) => (
          <Card key={project.id} className="overflow-hidden">
            {project.reference_image_url && (
              <img
                src={project.reference_image_url}
                alt="Referência"
                className="aspect-video w-full object-cover"
              />
            )}
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="font-semibold">{project.title}</div>
                <Badge variant="secondary">{String(project.status).replaceAll("_", " ")}</Badge>
              </div>
              {project.description && (
                <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>
              )}
              <div className="mt-3 text-xs text-muted-foreground">
                {[project.piece_type, project.clay, (project.glazes || []).join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => edit(project)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => archive.mutate(project.id)}>
                  <Archive className="mr-1 h-3.5 w-3.5" />
                  Arquivar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!projects.length && (
          <p className="text-sm text-muted-foreground">Você ainda não criou projetos.</p>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título">
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["ideia", "planejando", "em_andamento", "concluido"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descrição">
              <Input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
            <Field label="Tipo de peça">
              <Input
                value={form.piece_type}
                onChange={(event) => setForm({ ...form, piece_type: event.target.value })}
              />
            </Field>
            <Field label="Argila">
              <Input
                value={form.clay}
                onChange={(event) => setForm({ ...form, clay: event.target.value })}
              />
            </Field>
            <Field label="Esmaltes (separados por vírgula)">
              <Input
                value={form.glazes}
                onChange={(event) => setForm({ ...form, glazes: event.target.value })}
              />
            </Field>
            <Field label="Dimensões desejadas">
              <Input
                value={form.desired_dimensions}
                onChange={(event) => setForm({ ...form, desired_dimensions: event.target.value })}
              />
            </Field>
            <Field label="URL da imagem de referência">
              <Input
                type="url"
                value={form.reference_image_url}
                onChange={(event) => setForm({ ...form, reference_image_url: event.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notas">
                <Input
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PortalPage>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
