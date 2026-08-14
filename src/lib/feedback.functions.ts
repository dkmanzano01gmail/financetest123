import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FEEDBACK_EMAIL = "dkmanzano.o@hotmail.com";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby3jEledMUp539xy8lNieDAUlnWe7Qw4ixyxCfzf6wrxpl9W0epVgACSCTzv4Y2Uc44mQ/exec";
const APPS_SCRIPT_TOKEN =
  "fb_8a3e1c7d5f9042b6a1d8e7c3f9b2054a6c8d1e3f7b9a0245c6d8e1f3a7b9c2d4";

export const sendFeedbackNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { commentId: string }) => {
    if (!input?.commentId || !/^[0-9a-f-]{36}$/i.test(input.commentId)) {
      throw new Error("Comentário inválido.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const client = supabase as any;

    const { data: comment, error: commentError } = await client
      .from("feedback_comments")
      .select(
        "id,workspace_id,page,type,comment,device,created_by,created_at,email_sent_at,email_attempts",
      )
      .eq("id", data.commentId)
      .eq("created_by", userId)
      .maybeSingle();
    if (commentError) throw commentError;
    if (!comment) throw new Error("Comentário não encontrado.");
    if (comment.email_sent_at) {
      return { ok: true, alreadySent: true, recipient: FEEDBACK_EMAIL };
    }

    const { data: workspace } = await client
      .from("workspaces")
      .select("name")
      .eq("id", comment.workspace_id)
      .maybeSingle();

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "lovable_feedback",
          token: APPS_SCRIPT_TOKEN,
          comment: comment.comment,
          type: comment.type,
          page: comment.page,
          createdAt: comment.created_at,
          workspaceName: workspace?.name ?? "Não informado",
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error || "Falha no serviço de e-mail (" + response.status + ").",
        );
      }

      const { error: updateError } = await client
        .from("feedback_comments")
        .update({
          email_sent_at: new Date().toISOString(),
          email_error: null,
          email_attempts: Number(comment.email_attempts || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", comment.id)
        .eq("workspace_id", comment.workspace_id);
      if (updateError) throw updateError;

      return { ok: true, alreadySent: false, recipient: FEEDBACK_EMAIL };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client
        .from("feedback_comments")
        .update({
          email_error: message.slice(0, 1000),
          email_attempts: Number(comment.email_attempts || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", comment.id)
        .eq("workspace_id", comment.workspace_id);
      throw new Error("Comentário salvo, mas o e-mail não foi enviado: " + message);
    }
  });
