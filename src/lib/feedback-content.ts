export const FEEDBACK_RECIPIENT = "dkmanzano.o@hotmail.com";

export const FEEDBACK_TYPES = [
  ["general", "Comentário geral"],
  ["improvement", "Melhoria"],
  ["bug", "Erro/bug"],
  ["idea", "Ideia nova"],
  ["question", "Dúvida"],
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number][0];
