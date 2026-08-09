"use client";

import { useState } from "react";
import { ArrowClockwise, SpinnerGap, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppointmentActions({ id }: { id: string }) {
  const [mode, setMode] = useState<"closed" | "reschedule">("closed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(payload: Record<string, string>) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: crypto.randomUUID() }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "Не удалось изменить запись.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка изменения записи.");
      setLoading(false);
    }
  }

  async function cancel() {
    if (!window.confirm("Отменить эту запись? Действие будет сохранено в журнале.")) return;
    await mutate({ action: "cancel", reason: "Отменено сотрудником в портале" });
  }

  return (
    <div className="flex min-w-[230px] flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button disabled={loading} onClick={() => setMode(mode === "reschedule" ? "closed" : "reschedule")} size="sm" type="button" variant="outline"><ArrowClockwise className="size-4" />Перенести</Button>
        <Button disabled={loading} onClick={cancel} size="sm" type="button" variant="ghost"><X className="size-4" />Отменить</Button>
      </div>
      {mode === "reschedule" && (
        <form className="flex w-full flex-col gap-2 rounded-[12px] border border-border bg-white p-3" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate({ action: "reschedule", startsAt: new Date(String(data.get("startsAt"))).toISOString(), reason: "Перенос подтверждён сотрудником" }); }}>
          <label className="text-xs font-semibold" htmlFor={`starts-${id}`}>Новое время</label>
          <Input id={`starts-${id}`} name="startsAt" required type="datetime-local" />
          <Button disabled={loading} size="sm" type="submit">{loading && <SpinnerGap className="size-4 animate-spin" />}Подтвердить перенос</Button>
        </form>
      )}
      {error && <p className="max-w-[260px] text-right text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
