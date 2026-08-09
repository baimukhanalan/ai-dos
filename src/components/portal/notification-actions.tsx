"use client";

import { useState } from "react";
import { ArrowClockwise, Prohibit, SpinnerGap } from "@phosphor-icons/react";

type Action = "retry" | "cancel";

export function NotificationActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryable = status === "failed" || status === "blocked";
  const cancellable = retryable || status === "queued";

  async function run(action: Action) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message || "Не удалось обновить.");
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса.");
    } finally {
      setPending(null);
    }
  }

  if (!cancellable) return null;

  return (
    <div className="text-right">
      <div className="flex justify-end gap-2">
        {retryable && (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-primary transition hover:bg-muted disabled:opacity-50"
            disabled={pending !== null}
            onClick={() => run("retry")}
            type="button"
          >
            {pending === "retry" ? (
              <SpinnerGap className="size-3.5 animate-spin" />
            ) : (
              <ArrowClockwise className="size-3.5" />
            )}
            Повторить
          </button>
        )}
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          disabled={pending !== null}
          onClick={() => run("cancel")}
          type="button"
        >
          {pending === "cancel" ? (
            <SpinnerGap className="size-3.5 animate-spin" />
          ) : (
            <Prohibit className="size-3.5" />
          )}
          Отменить
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
