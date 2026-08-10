"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react";

type Slot = { startsAt: string; durationMinutes: number };

/**
 * Три исхода срочного запроса вместо одного «одобрено»: принять вне графика,
 * предложить штатное время или отказать. Время для «Одобрить» вводится
 * вручную — в этом и смысл исключения; для «Предложить» выбирается из живого
 * расписания, иначе пациент получил бы неподтверждаемое предложение.
 */
export function UrgentDecision({
  id,
  doctorId,
  timezone,
}: {
  id: string;
  doctorId: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [offerSlot, setOfferSlot] = useState("");
  const [note, setNote] = useState("");
  const [loadedSlots, setLoadedSlots] = useState(false);

  const format = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
  });

  async function loadSlots() {
    if (!doctorId || loadedSlots) return;
    setLoadedSlots(true);
    try {
      const response = await fetch(`/api/appointments?doctorId=${doctorId}&days=14`);
      const payload = await response.json();
      if (response.ok) setSlots((payload.data as Slot[]) || []);
    } catch {
      setError("Не удалось загрузить свободное время.");
    }
  }

  async function decide(body: Record<string, unknown>, key: string) {
    setPending(key);
    setError(null);
    try {
      const response = await fetch(`/api/urgent/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, note: note.trim() || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "Не удалось сохранить решение.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка решения.");
    } finally {
      setPending(null);
    }
  }

  const buttonClass =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold transition hover:bg-muted disabled:opacity-50";

  return (
    <div className="w-full max-w-xs space-y-2 text-right">
      <input
        className="h-8 w-full rounded-lg border border-border bg-white px-2 text-xs"
        onChange={(event) => setManualTime(event.target.value)}
        type="datetime-local"
        value={manualTime}
      />
      <button
        className={`${buttonClass} w-full justify-center text-primary`}
        disabled={pending !== null || !manualTime}
        onClick={() =>
          decide(
            { action: "approve", startsAt: new Date(manualTime).toISOString() },
            "approve",
          )
        }
        type="button"
      >
        {pending === "approve" && <SpinnerGap className="size-3.5 animate-spin" />}
        Одобрить вне графика
      </button>

      {doctorId && (
        <select
          className="h-8 w-full rounded-lg border border-border bg-white px-2 text-xs"
          onChange={(event) => setOfferSlot(event.target.value)}
          onFocus={loadSlots}
          value={offerSlot}
        >
          <option value="">Предложить штатное время…</option>
          {slots.map((slot) => (
            <option key={slot.startsAt} value={slot.startsAt}>
              {format.format(new Date(slot.startsAt))}
            </option>
          ))}
        </select>
      )}
      <button
        className={`${buttonClass} w-full justify-center text-primary`}
        disabled={pending !== null || !offerSlot}
        onClick={() => decide({ action: "offer", startsAt: offerSlot }, "offer")}
        type="button"
      >
        {pending === "offer" && <SpinnerGap className="size-3.5 animate-spin" />}
        Предложить пациенту
      </button>

      <input
        className="h-8 w-full rounded-lg border border-border bg-white px-2 text-xs"
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Комментарий (необязательно)"
        value={note}
      />
      <button
        className={`${buttonClass} w-full justify-center text-destructive`}
        disabled={pending !== null}
        onClick={() => decide({ action: "decline" }, "decline")}
        type="button"
      >
        {pending === "decline" && <SpinnerGap className="size-3.5 animate-spin" />}
        Отказать
      </button>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
