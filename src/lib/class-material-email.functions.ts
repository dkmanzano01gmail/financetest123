import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendStudentMaterialsStatement } from "@/lib/notification-email";

function uuid(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Identificador inválido.");
  return value;
}

export const emailClassMaterialsStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; studentId: string; total: number; filename: string; pdfBase64: string }) => {
    const total = Number(input.total);
    if (!Number.isFinite(total) || total < 0) throw new Error("Valor do demonstrativo inválido.");
    if (!input.pdfBase64 || input.pdfBase64.length > 14_000_000) throw new Error("PDF inválido ou maior que 10 MB.");
    return {
      workspaceId: uuid(input.workspaceId),
      studentId: uuid(input.studentId),
      total,
      filename: input.filename.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 100) || "materiais.pdf",
      pdfBase64: input.pdfBase64,
    };
  })
  .handler(async ({ data, context }) => {
    const client = context.supabase as any;
    const membership = await client
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new Error("Acesso não autorizado.");

    let result = await client
      .from("students")
      .select("id,name,email")
      .eq("id", data.studentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (result.error?.message.includes("'email' column")) {
      result = await client
        .from("students")
        .select("id,name")
        .eq("id", data.studentId)
        .eq("workspace_id", data.workspaceId)
        .maybeSingle();
    }
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Aluno não encontrado neste workspace.");
    const target = String(result.data.email || "").trim().toLowerCase();
    if (!target) throw new Error("Este aluno não possui e-mail cadastrado.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) throw new Error("O e-mail cadastrado para este aluno é inválido.");

    await sendStudentMaterialsStatement({
      to: target,
      studentName: result.data.name,
      total: data.total,
      filename: data.filename,
      pdfBase64: data.pdfBase64,
    });
    return { ok: true, recipient: target };
  });
