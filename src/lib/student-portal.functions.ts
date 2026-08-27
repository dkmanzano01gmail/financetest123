import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function uuid(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("Identificador inválido.");
  return value;
}
function email(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("E-mail inválido.");
  return normalized;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function manager(admin: any, workspaceId: string, userId: string) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !["owner", "member"].includes(data.role)) throw new Error("Acesso não autorizado.");
}
async function userForEmail(admin: any, target: string) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const found = result.data.users.find((u: any) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (result.data.users.length < 1000) break;
  }
  return null;
}
function authEmail(context: any) {
  return String(context.claims?.email || "").toLowerCase();
}

export const sendStudentPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; studentId: string; email: string }) => ({
    workspaceId: uuid(input.workspaceId),
    studentId: uuid(input.studentId),
    email: email(input.email),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await manager(admin, data.workspaceId, context.userId);
    const studentResult = await admin
      .from("students")
      .select("id")
      .eq("id", data.studentId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (studentResult.error) throw studentResult.error;
    if (!studentResult.data) throw new Error("Aluno não encontrado neste workspace.");

    const existing = await userForEmail(admin, data.email);
    const rawToken = token();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const { error: saveError } = await admin.from("student_portal_access").upsert(
      {
        workspace_id: data.workspaceId,
        student_id: data.studentId,
        user_id: existing?.id ?? null,
        invited_email: data.email,
        status: "convite_pendente",
        invite_token_hash: await hash(rawToken),
        requires_password: !existing,
        invited_at: new Date().toISOString(),
        expires_at: expiresAt,
        accepted_at: null,
        revoked_at: null,
        created_by: context.userId,
      },
      { onConflict: "workspace_id,student_id" },
    );
    if (saveError) throw saveError;
    const { error: studentError } = await admin
      .from("students")
      .update({ email: data.email })
      .eq("id", data.studentId);
    if (studentError) throw studentError;

    const request = getRequest();
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/student-invite?token=${encodeURIComponent(rawToken)}`;
    const sent = existing
      ? await admin.auth.signInWithOtp({
          email: data.email,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
        })
      : await admin.auth.admin.inviteUserByEmail(data.email, { redirectTo });
    if (sent.error) throw sent.error;
    return { ok: true, expiresAt, existingAccount: !!existing };
  });

export const revokeStudentPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; studentId: string }) => ({
    workspaceId: uuid(input.workspaceId),
    studentId: uuid(input.studentId),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    await manager(admin, data.workspaceId, context.userId);
    const { error } = await admin
      .from("student_portal_access")
      .update({
        status: "revogado",
        revoked_at: new Date().toISOString(),
        invite_token_hash: null,
        expires_at: null,
      })
      .eq("workspace_id", data.workspaceId)
      .eq("student_id", data.studentId);
    if (error) throw error;
    return { ok: true };
  });

export const getStudentPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    if (!/^[0-9a-f]{64}$/i.test(input.token)) throw new Error("Convite inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: access, error } = await (supabaseAdmin as any)
      .from("student_portal_access")
      .select(
        "id,invited_email,status,expires_at,requires_password,students(name),workspaces(name)",
      )
      .eq("invite_token_hash", await hash(data.token))
      .maybeSingle();
    if (error) throw error;
    if (!access) throw new Error("Convite inválido ou já utilizado.");
    if (access.status !== "convite_pendente")
      throw new Error("Este convite não está mais disponível.");
    if (!access.expires_at || new Date(access.expires_at) <= new Date())
      throw new Error("Este convite expirou.");
    if (authEmail(context) !== access.invited_email.toLowerCase())
      throw new Error("Entre com o e-mail que recebeu o convite.");
    return {
      studentName: access.students?.name ?? "Aluno",
      workspaceName: access.workspaces?.name ?? "Selá Cerâmica",
      email: access.invited_email,
      requiresPassword: access.requires_password,
      expiresAt: access.expires_at,
    };
  });

export const acceptStudentPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    if (!/^[0-9a-f]{64}$/i.test(input.token)) throw new Error("Convite inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const tokenHash = await hash(data.token);
    const result = await admin
      .from("student_portal_access")
      .select("id,invited_email,status,expires_at,user_id")
      .eq("invite_token_hash", tokenHash)
      .maybeSingle();
    if (result.error) throw result.error;
    const access = result.data;
    if (!access || access.status !== "convite_pendente")
      throw new Error("Convite inválido ou já utilizado.");
    if (!access.expires_at || new Date(access.expires_at) <= new Date())
      throw new Error("Este convite expirou.");
    if (authEmail(context) !== access.invited_email.toLowerCase())
      throw new Error("Entre com o e-mail que recebeu o convite.");
    if (access.user_id && access.user_id !== context.userId)
      throw new Error("Este convite pertence a outra conta.");
    const updated = await admin
      .from("student_portal_access")
      .update({
        user_id: context.userId,
        status: "ativo",
        accepted_at: new Date().toISOString(),
        invite_token_hash: null,
        requires_password: false,
      })
      .eq("id", access.id)
      .eq("status", "convite_pendente")
      .eq("invite_token_hash", tokenHash)
      .select("id")
      .maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) throw new Error("Este convite já foi utilizado.");
    return { ok: true };
  });
