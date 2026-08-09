"use client";

import { useState } from "react";
import { Check, SpinnerGap, X } from "@phosphor-icons/react";

type Action = "accept" | "decline";

export function WaitlistOfferActions({ id }: { id: string }) {
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: Action) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/waitlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, idempotencyKey: crypto.randomUUID() }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          payload.error?.message || "Не удалось обработать предложение.",
        );
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка запроса.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="text-right">
      <div className="flex justify-end gap-2">
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          disabled={pending !== null}
          onClick={() => respond("accept")}
          type="button"
        >
          {pending === "accept" ? (
            <SpinnerGap className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Записать
        </button>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          disabled={pending !== null}
          onClick={() => respond("decline")}
          type="button"
        >
          {pending === "decline" ? (
            <SpinnerGap className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
          Отказ
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
