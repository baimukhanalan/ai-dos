"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, Copy, SpinnerGap, UserPlus } from "@phosphor-icons/react";

type DoctorOption = {
  id: string;
  name: string;
};

export function StaffInviteForm({ doctors }: { doctors: DoctorOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<"operator" | "doctor">("operator");
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage("");
    setInviteUrl("");
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/clinic/staff/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          email: form.get("email"),
          role,
          doctorId: role === "doctor" ? form.get("doctorId") : null,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        idempotencyKey.current = null;
        setMessage(payload.error?.message || "Не удалось создать приглашение.");
        return;
      }
      idempotencyKey.current = null;
      setInviteUrl(String(payload.data.inviteUrl));
      setMessage("Одноразовая ссылка создана на 48 часов.");
      router.refresh();
    } catch {
      setMessage("Нет связи с сервером. Повторите — приглашение не задублируется.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!open) {
    return (
      <button
        className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white"
        onClick={() => setOpen(true)}
        type="button"
      >
        <UserPlus className="size-4" /> Пригласить сотрудника
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-[14px] border border-border bg-white p-5"
      onSubmit={submit}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Новое приглашение</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Пароль сотрудник задаст сам по одноразовой ссылке.
          </p>
        </div>
        <button
          className="text-sm text-muted-foreground"
          onClick={() => setOpen(false)}
          type="button"
        >
          Закрыть
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          className="h-11 rounded-[9px] border border-input px-3"
          name="fullName"
          placeholder="ФИО сотрудника"
          required
        />
        <input
          className="h-11 rounded-[9px] border border-input px-3"
          name="email"
          placeholder="name@clinic.kz"
          type="email"
          required
        />
      </div>
      <select
        className="h-11 w-full rounded-[9px] border border-input bg-white px-3"
        value={role}
        onChange={(event) =>
          setRole(event.target.value as "operator" | "doctor")
        }
      >
        <option value="operator">Регистратор</option>
        <option value="doctor">Врач</option>
      </select>
      {role === "doctor" && (
        <select
          className="h-11 w-full rounded-[9px] border border-input bg-white px-3"
          name="doctorId"
          required
        >
          <option value="">Выберите профиль врача</option>
          {doctors.map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.name}
            </option>
          ))}
        </select>
      )}
      {message && (
        <p className="text-sm text-primary" role="status">
          {message}
        </p>
      )}
      {inviteUrl && (
        <div className="flex gap-2 rounded-[10px] bg-muted p-2">
          <input
            className="min-w-0 flex-1 bg-transparent px-2 text-xs"
            readOnly
            value={inviteUrl}
          />
          <button
            aria-label="Скопировать ссылку"
            className="inline-flex size-9 items-center justify-center rounded-[8px] bg-white text-primary"
            onClick={copyLink}
            type="button"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        </div>
      )}
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-primary font-semibold text-white disabled:opacity-60"
        disabled={pending || (role === "doctor" && doctors.length === 0)}
        type="submit"
      >
        {pending && <SpinnerGap className="size-4 animate-spin" />}
        Создать ссылку
      </button>
    </form>
  );
}
