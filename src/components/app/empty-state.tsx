import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent text-accent-foreground mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
