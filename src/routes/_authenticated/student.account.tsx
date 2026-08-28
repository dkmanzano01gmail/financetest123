import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStudentPortalAccess } from "@/hooks/use-student-portal";
import { PortalPage } from "@/components/student/portal-page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
export const Route = createFileRoute("/_authenticated/student/account")({ component: Account });
const sb = supabase as any;
function Account() {
  const { data: access } = useStudentPortalAccess();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: student } = useQuery({
    queryKey: ["student-profile", access?.id],
    enabled: !!access,
    queryFn: async () => {
      const r = await sb
        .from("students")
        .select("name,email,class_name,phone,instagram,enrollment_date,photo_url")
        .eq("workspace_id", access!.workspace_id)
        .eq("id", access!.student_id)
        .single();
      if (r.error) throw r.error;
      return r.data;
    },
  });
  async function changePassword() {
    if (password.length < 8) return toast.error("A senha deve ter pelo menos 8 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setSaving(true);
    const result = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (result.error) return toast.error(result.error.message);
    setPassword("");
    setConfirm("");
    toast.success("Senha alterada com sucesso.");
  }
  return (
    <PortalPage title="Minha conta">
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row">
          {student?.photo_url && (
            <img
              src={student.photo_url}
              alt={student.name}
              className="h-24 w-24 rounded-full object-cover"
            />
          )}
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Nome</div>
              <div className="font-medium">{student?.name || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">E-mail</div>
              <div>{student?.email || access?.invited_email || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Turma</div>
              <div>{student?.class_name || "—"}</div>
            </div>
            {student?.phone && (
              <div>
                <div className="text-xs text-muted-foreground">Telefone</div>
                <div>{student.phone}</div>
              </div>
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Para alterar seus dados, fale com a equipe do Selá Cerâmica.
            </p>
          </div>
        </CardContent>
      </Card>
      {!access?.is_preview && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <div className="font-semibold">Alterar senha</div>
              <p className="text-sm text-muted-foreground">Use pelo menos 8 caracteres.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="student-password">Nova senha</Label>
                <Input
                  id="student-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="student-password-confirm">Confirmar senha</Label>
                <Input
                  id="student-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            </div>
            <Button onClick={changePassword} disabled={saving || !password || !confirm}>
              {saving ? "Salvando…" : "Alterar senha"}
            </Button>
          </CardContent>
        </Card>
      )}
    </PortalPage>
  );
}
