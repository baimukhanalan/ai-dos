"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react";

export function DoctorAvailabilityForm() {
  const router = useRouter();
  const [kind, setKind] = useState("break");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const needsTime = kind !== "vacation";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage("");
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/doctor/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          date: form.get("date"),
          startsAt: needsTime ? form.get("startsAt") : null,
          endsAt: needsTime ? form.get("endsAt") : null,
          reason: form.get("reason"),
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        idempotencyKey.current = null;
        setMessage(payload.error?.message || "Не удалось изменить доступность.");
        return;
      }
      idempotencyKey.current = null;
      setMessage("Доступность обновлена.");
      formElement.reset();
      router.refresh();
    } catch {
      setMessage("Нет связи с сервером. Повторите — изменение не задублируется.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4 rounded-[16px] border border-border bg-white/75 p-5" onSubmit={submit}>
      <div>
        <h2 className="font-semibold">Изменить доступность</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Перерыв и блокировка исключают слоты; дополнительное окно добавляет реальное время для записи.
        </p>
      </div>
      <select className="h-11 w-full rounded-[9px] border border-input bg-white px-3" onChange={(event) => setKind(event.target.value)} value={kind}>
        <option value="break">Перерыв</option>
        <option value="unavailable">Закрыть время</option>
        <option value="vacation">Отпуск / весь день</option>
        <option value="extra_slot">Открыть дополнительное окно</option>
      </select>
      <input className="h-11 w-full rounded-[9px] border border-input px-3" min={new Date().toISOString().slice(0, 10)} name="date" required type="date" />
      {needsTime && (
        <div className="grid grid-cols-2 gap-3">
          <input className="h-11 rounded-[9px] border border-input px-3" name="startsAt" required type="time" />
          <input className="h-11 rounded-[9px] border border-input px-3" name="endsAt" required type="time" />
        </div>
      )}
      <input className="h-11 w-full rounded-[9px] border border-input px-3" maxLength={240} name="reason" placeholder="Причина или комментарий" required />
      {message && <p className="text-sm text-primary" role="status">{message}</p>}
      <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-primary font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
        {pending && <SpinnerGap className="size-4 animate-spin" />} Сохранить
      </button>
    </form>
  );
}
