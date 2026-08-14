import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { FEEDBACK_RECIPIENT, FEEDBACK_TYPES, type FeedbackType } from "@/lib/feedback-content";
import { sendFeedbackNotification } from "@/lib/feedback.functions";

const sb = supabase as any;

export function QuickFeedbackButton({
  workspaceId,
  pathname,
  sidebarCollapsed,
}: {
  workspaceId: string;
  pathname: string;
  sidebarCollapsed: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("general");
  const [comment, setComment] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const clean = comment.trim();
      if (!clean) throw new Error("Escreva uma mensagem antes de enviar.");

      const { data: auth } = await supabase.auth.getUser();
      const { data: created, error } = await sb
        .from("feedback_comments")
        .insert({
          workspace_id: workspaceId,
          page: pathname || "Não informado",
          type,
          comment: clean,
          device: typeof navigator === "undefined" ? null : navigator.userAgent,
          status: "new",
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      try {
        await sendFeedbackNotification({ data: { commentId: created.id } });
        return { emailSent: true, emailError: null };
      } catch (emailError) {
        return {
          emailSent: false,
          emailError: emailError instanceof Error ? emailError.message : String(emailError),
        };
      }
    },
    onSuccess: (result) => {
      setComment("");
      setType("general");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["feedback_comments"] });
      if (result.emailSent) {
        toast.success("Mensagem salva e enviada. Obrigado pelo feedback!");
      } else {
        toast.warning(result.emailError || "Mensagem salva, mas o e-mail não foi enviado.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour-key="quick-feedback"
        title="Enviar comentário"
        aria-label="Enviar comentário"
        className={`fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-primary-foreground/15 bg-primary text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:bottom-5 ${
          sidebarCollapsed ? "md:left-[5.5rem]" : "md:left-[17rem]"
        }`}
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envie uma mensagem</DialogTitle>
            <DialogDescription>
              Compartilhe uma dúvida, ideia, melhoria ou erro sem sair da tela atual. A mensagem
              também ficará disponível na aba Comentários.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="quick-feedback-type">Tipo</Label>
              <Select value={type} onValueChange={(value) => setType(value as FeedbackType)}>
                <SelectTrigger id="quick-feedback-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-feedback-comment">Mensagem</Label>
              <Textarea
                id="quick-feedback-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Conte o que podemos melhorar, uma dúvida ou uma nova ideia..."
                rows={5}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Uma cópia será enviada para {FEEDBACK_RECIPIENT}.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !comment.trim()}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {create.isPending ? "Enviando…" : "Enviar mensagem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
