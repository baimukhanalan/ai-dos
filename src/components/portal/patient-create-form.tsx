"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, SpinnerGap, X } from "@phosphor-icons/react";

export function PatientCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage("");
    const form = new FormData(formElement);
    const response = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        phone: form.get("phone"),
        birthDate: form.get("birthDate"),
        preferredLanguage: form.get("preferredLanguage"),
        notes: form.get("notes"),
      }),
    });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Не удалось создать пациента.");
      return;
    }
    setMessage("Пациент добавлен.");
    formElement.reset();
    router.refresh();
  }

  if (!open)
    return (
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-[#064b32]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus className="size-4" /> Добавить пациента
      </button>
    );

  return (
    <div className="w-full max-w-[620px] rounded-[14px] border border-border bg-white p-5 shadow-lg">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-semibold">Новый пациент</h2>
        <button
          aria-label="Закрыть форму"
          className="p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          type="button"
        >
          <X className="size-5" />
        </button>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <Field label="ФИО" name="fullName" placeholder="Имя пациента" />
        <Field label="Телефон" name="phone" placeholder="+7 700 000 00 00" />
        <Field
          label="Дата рождения"
          name="birthDate"
          type="date"
          required={false}
        />
        <label className="text-sm font-medium">
          Язык
          <select
            className="mt-2 h-11 w-full rounded-[9px] border border-input bg-white px-3 font-normal"
            name="preferredLanguage"
          >
            <option value="ru">Русский</option>
            <option value="kk">Қазақша</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Заметка
          <textarea
            className="mt-2 min-h-20 w-full rounded-[9px] border border-input bg-white p-3 font-normal"
            name="notes"
            placeholder="Только необходимые операционные сведения"
          />
        </label>
        {message && (
          <p className="text-sm text-primary sm:col-span-2">{message}</p>
        )}
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[9px] bg-primary px-4 text-sm font-semibold text-white sm:col-span-2"
          disabled={pending}
          type="submit"
        >
          {pending && <SpinnerGap className="size-4 animate-spin" />} Сохранить
          пациента
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  required = true,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 h-11 w-full rounded-[9px] border border-input bg-white px-3 font-normal"
        name={name}
        required={required}
        {...props}
      />
    </label>
  );
}
