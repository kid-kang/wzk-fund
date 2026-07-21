import { cn } from '@/lib/utils';

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line/80 bg-panel/90 shadow-[0_10px_40px_rgba(21,32,43,0.04)] backdrop-blur-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line/70 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold tracking-tight text-ink sm:text-lg">
          {title}
        </h2>
        {desc ? <p className="mt-0.5 text-xs text-muted">{desc}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
