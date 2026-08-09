import type { ReactNode } from "react";

export function ModuleSection({
  id,
  title,
  description,
  count,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-[16px] border border-border bg-white/75"
      id={id}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {typeof count === "number" && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyModule({ children }: { children: ReactNode }) {
  return (
    <p className="p-8 text-center text-sm leading-6 text-muted-foreground">
      {children}
    </p>
  );
}

export function StatusPill({ status }: { status: string }) {
  const positive = [
    "active",
    "connected",
    "completed",
    "done",
    "approved",
    "published",
    "sent",
    "delivered",
    "confirmed",
  ].includes(status);
  const warning = [
    "pending",
    "new",
    "open",
    "in_progress",
    "queued",
    "trial",
    "scheduled",
    "ringing",
    "running",
  ].includes(status);
  return (
    <span
      className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${positive ? "bg-[#e0f2e8] text-primary" : warning ? "bg-[#fff3d9] text-[#7c5d13]" : "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}
