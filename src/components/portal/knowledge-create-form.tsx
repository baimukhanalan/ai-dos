"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpenText, SpinnerGap } from "@phosphor-icons/react";

export function KnowledgeCreateForm() {
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
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        content: form.get("content"),
        locale: form.get("locale"),
      }),
    });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Не удалось сохранить.");
      return;
    }
    setMessage("Статья опубликована.");
    formElement.reset();
    router.refresh();
  }
  if (!open)
    return (
      <button
        className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white"
        onClick={() => setOpen(true)}
        type="button"
      >
        <BookOpenText className="size-4" /> Новая статья
      </button>
    );
  return (
    <form
      className="w-full max-w-[720px] space-y-4 rounded-[14px] border border-border bg-white p-5 shadow-lg"
      onSubmit={submit}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Статья базы знаний</h2>
        <button
          className="text-sm text-muted-foreground"
          onClick={() => setOpen(false)}
          type="button"
        >
          Закрыть
        </button>
      </div>
      <input
        className="h-11 w-full rounded-[9px] border border-input px-3"
        name="title"
        placeholder="Например: Подготовка к приёму терапевта"
        required
      />
      <textarea
        className="min-h-36 w-full rounded-[9px] border border-input p-3"
        name="content"
        placeholder="Только утверждённая клиникой информация…"
        required
      />
      <select
        className="h-11 w-full rounded-[9px] border border-input bg-white px-3"
        name="locale"
      >
        <option value="ru">Русский</option>
        <option value="kk">Қазақша</option>
        <option value="en">English</option>
      </select>
      {message && <p className="text-sm text-primary">{message}</p>}
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-primary font-semibold text-white"
        disabled={pending}
        type="submit"
      >
        {pending && <SpinnerGap className="size-4 animate-spin" />} Опубликовать
      </button>
    </form>
  );
}
