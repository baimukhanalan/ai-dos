"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListChecks, SpinnerGap } from "@phosphor-icons/react";
import { ruleCategories, ruleCategoryLabels } from "@/lib/ai/knowledge-rules";

export function RuleCreateForm() {
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
    const response = await fetch("/api/knowledge-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const payload = await response.json();
    setPending(false);
    if (!response.ok) {
      setMessage(payload.error?.message || "Не удалось сохранить.");
      return;
    }
    setMessage("Правило опубликовано.");
    formElement.reset();
    router.refresh();
  }

  if (!open)
    return (
      <button
        className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-border bg-white px-4 text-sm font-semibold text-primary"
        onClick={() => setOpen(true)}
        type="button"
      >
        <ListChecks className="size-4" /> Новое правило
      </button>
    );

  return (
    <form
      className="w-full max-w-[720px] space-y-4 rounded-[14px] border border-border bg-white p-5 shadow-lg"
      onSubmit={submit}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Правило клиники</h2>
        <button className="text-sm text-muted-foreground" onClick={() => setOpen(false)} type="button">
          Закрыть
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select className="h-11 w-full rounded-[9px] border border-input bg-white px-3" name="category">
          {ruleCategories.map((c) => (
            <option key={c} value={c}>{ruleCategoryLabels[c]}</option>
          ))}
        </select>
        <select className="h-11 w-full rounded-[9px] border border-input bg-white px-3" name="scope">
          <option value="clinic">Вся клиника</option>
          <option value="doctor">Врач</option>
          <option value="service">Услуга</option>
        </select>
      </div>
      <input
        className="h-11 w-full rounded-[9px] border border-input px-3"
        name="title"
        placeholder="Например: Опоздание более 15 минут"
        required
      />
      <textarea
        className="min-h-28 w-full rounded-[9px] border border-input p-3"
        name="body"
        placeholder="Точное правило клиники: что делать, какие ограничения…"
        required
      />
      <input
        className="h-11 w-full rounded-[9px] border border-input px-3"
        name="keywords"
        placeholder="Ключевые слова через запятую: опоздание, задержка, late"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <select className="h-11 w-full rounded-[9px] border border-input bg-white px-3" name="locale">
          <option value="ru">Русский</option>
          <option value="kk">Қазақша</option>
          <option value="en">English</option>
        </select>
        <input
          className="h-11 w-full rounded-[9px] border border-input px-3"
          name="priority"
          type="number"
          min={1}
          max={200}
          defaultValue={100}
          placeholder="Приоритет 1–200"
        />
      </div>
      {message && <p className="text-sm text-primary">{message}</p>}
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-primary font-semibold text-white"
        disabled={pending}
        type="submit"
      >
        {pending && <SpinnerGap className="size-4 animate-spin" />} Опубликовать правило
      </button>
    </form>
  );
}
