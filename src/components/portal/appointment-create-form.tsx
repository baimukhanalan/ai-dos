"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, SpinnerGap, X } from "@phosphor-icons/react";

type Option = Record<string, unknown>;
type Slot = { startsAt: string; durationMinutes: number };

export function AppointmentCreateForm({
  patients,
  doctors,
  services,
  timezone,
}: {
  patients: Option[];
  doctors: Option[];
  services: Option[];
  timezone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [slotsPending, setSlotsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [doctorId, setDoctorId] = useState(String(doctors[0]?.id || ""));
  const [slots, setSlots] = useState<Slot[]>([]);
  const slotsController = useRef<AbortController | null>(null);

  const selectedDoctor = doctors.find(
    (doctor) => String(doctor.id) === doctorId,
  );
  const matchingServices = services.filter(
    (service) =>
      !service.specialty_id ||
      !selectedDoctor?.specialty_id ||
      String(service.specialty_id) === String(selectedDoctor.specialty_id),
  );

  async function loadSlots(nextDoctorId: string) {
    setDoctorId(nextDoctorId);
    slotsController.current?.abort();
    if (!nextDoctorId) return;

    const controller = new AbortController();
    slotsController.current = controller;
    setSlotsPending(true);
    setSlots([]);
    setMessage("");

    try {
      const response = await fetch(
        `/api/appointments?doctorId=${encodeURIComponent(nextDoctorId)}&days=14`,
        { signal: controller.signal },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message || "Не удалось загрузить время.",
        );
      }
      setSlots(payload.data || []);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(
        error instanceof Error ? error.message : "Не удалось загрузить время.",
      );
    } finally {
      if (!controller.signal.aborted) setSlotsPending(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: form.get("patientId"),
        doctorId,
        serviceId: form.get("serviceId") || null,
        startsAt: form.get("startsAt"),
        reason: form.get("reason"),
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Не удалось создать запись.");
      return;
    }
    setMessage("Запись подтверждена.");
    setSlots((current) =>
      current.filter((slot) => slot.startsAt !== payload.data.startsAt),
    );
    router.refresh();
  }

  const formatSlot = (value: string) =>
    new Intl.DateTimeFormat("ru-KZ", {
      timeZone: timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

  if (!open) {
    return (
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-[#064b32]"
        onClick={() => {
          setOpen(true);
          void loadSlots(doctorId);
        }}
        type="button"
      >
        <CalendarPlus className="size-4" /> Новая запись
      </button>
    );
  }

  return (
    <div className="w-full max-w-[720px] rounded-[14px] border border-border bg-white p-5 shadow-lg">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">Новая запись</h2>
        <button
          aria-label="Закрыть форму"
          className="p-1 text-muted-foreground"
          onClick={() => {
            slotsController.current?.abort();
            setOpen(false);
          }}
          type="button"
        >
          <X className="size-5" />
        </button>
      </div>
      {patients.length && doctors.length ? (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <Select
            label="Пациент"
            name="patientId"
            options={patients.map((item) => ({
              value: String(item.id),
              label: String(item.full_name),
            }))}
          />
          <label className="text-sm font-medium">
            Врач
            <select
              className="mt-2 h-11 w-full rounded-[9px] border border-input bg-white px-3 font-normal"
              name="doctorId"
              onChange={(event) => void loadSlots(event.target.value)}
              value={doctorId}
            >
              {doctors.map((item) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {String(item.display_name)} ·{" "}
                  {String(item.specialty_name || "Врач")}
                </option>
              ))}
            </select>
          </label>
          <Select
            label="Услуга"
            name="serviceId"
            options={matchingServices.map((item) => ({
              value: String(item.id),
              label: String(item.name),
            }))}
            optional
          />
          <label className="text-sm font-medium">
            Свободное время
            <select
              className="mt-2 h-11 w-full rounded-[9px] border border-input bg-white px-3 font-normal"
              disabled={slotsPending || !slots.length}
              name="startsAt"
              required
            >
              {slotsPending ? (
                <option value="">Проверяем расписание…</option>
              ) : slots.length ? (
                slots.map((slot) => (
                  <option key={slot.startsAt} value={slot.startsAt}>
                    {formatSlot(slot.startsAt)} · {slot.durationMinutes} мин
                  </option>
                ))
              ) : (
                <option value="">Нет свободного времени</option>
              )}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Причина обращения
            <input
              className="mt-2 h-11 w-full rounded-[9px] border border-input px-3 font-normal"
              name="reason"
              placeholder="Без диагноза — только цель записи"
            />
          </label>
          {message && (
            <p
              aria-live="polite"
              className="text-sm text-primary sm:col-span-2"
            >
              {message}
            </p>
          )}
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[9px] bg-primary text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
            disabled={pending || slotsPending || !slots.length}
            type="submit"
          >
            {pending && <SpinnerGap className="size-4 animate-spin" />}{" "}
            Подтвердить запись
          </button>
        </form>
      ) : (
        <p className="rounded-[10px] bg-muted p-4 text-sm text-muted-foreground">
          Сначала добавьте пациента и врача.
        </p>
      )}
    </div>
  );
}

function Select({
  label,
  name,
  options,
  optional,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  optional?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        className="mt-2 h-11 w-full rounded-[9px] border border-input bg-white px-3 font-normal"
        name={name}
        required={!optional}
      >
        {optional && <option value="">Без услуги</option>}
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
