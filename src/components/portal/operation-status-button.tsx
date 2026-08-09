"use client";

import { useState } from "react";
import { Check, SpinnerGap } from "@phosphor-icons/react";

export function OperationStatusButton({
  resource,
  id,
  status,
  label,
}: {
  resource: "callbacks" | "tasks" | "urgent";
  id: string;
  status: string;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operations/${resource}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message || "Не удалось обновить статус.");
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка обновления.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-primary transition hover:bg-muted disabled:opacity-50"
        disabled={loading}
        onClick={update}
        type="button"
      >
        {loading ? <SpinnerGap className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {label}
      </button>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
