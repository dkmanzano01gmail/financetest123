import { ReactNode } from "react";
import { InfoTip } from "@/components/app/info-tip";
import type { HelpKey } from "@/lib/help-content";

export function PageHeader({
  title,
  description,
  action,
  helpKey,
  titleBadge,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  helpKey?: HelpKey;
  titleBadge?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
          {titleBadge && (
            <span className="rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {titleBadge}
            </span>
          )}
          {helpKey && <InfoTip helpKey={helpKey} />}
        </div>
        {description && <p className="text-muted-foreground text-sm mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">{children}</div>;
}
