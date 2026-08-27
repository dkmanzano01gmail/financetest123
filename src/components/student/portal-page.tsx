import type { ReactNode } from "react";

export function PortalPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}

export const pieceStatus: Record<string, string> = {
  in_progress: "Modelagem",
  modelagem: "Modelagem",
  drying: "Secagem",
  secagem: "Secagem",
  bisque: "Biscoito",
  biscoito: "Biscoito",
  aguardando_esmaltacao: "Aguardando esmaltação",
  glazing: "Esmaltada",
  esmaltada: "Esmaltada",
  queima_final: "Queima final",
  completed: "Pronta para retirada",
  pronta_para_retirada: "Pronta para retirada",
  delivered: "Retirada",
  retirada: "Retirada",
};
export function brl(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value || 0);
}
export function date(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : "—";
}
