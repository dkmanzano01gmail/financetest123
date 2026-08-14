import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { NOTIFICATION_EMAIL, sendAdminNotification } from "@/lib/notification-email";

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
      return { ok: true, alreadySent: true, recipient: NOTIFICATION_EMAIL };
    }

    const { data: workspace } = await client
      .from("workspaces")
      .select("name")
      .eq("id", comment.workspace_id)
      .maybeSingle();

    try {
      await sendAdminNotification({
        comment: comment.comment,
        type: comment.type,
        page: comment.page,
        createdAt: comment.created_at,
        workspaceName: workspace?.name ?? "Não informado",
      });

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

      return { ok: true, alreadySent: false, recipient: NOTIFICATION_EMAIL };
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
