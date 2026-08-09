"use client";

import { useState } from "react";
import { Plus, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  notificationChannelLabels,
  notificationChannels,
  notificationTemplateCodes,
} from "@/lib/notifications/templates";

type Kind = "scenario" | "campaign" | "template";

export function AutomationCreate() {
  const [kind, setKind] = useState<Kind>("scenario");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    const common = Object.fromEntries(formData.entries());
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...common }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message || "Не удалось сохранить автоматизацию.");
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[15px] border border-border bg-white/75 p-5">
      <div className="flex flex-wrap gap-2">
        {([
          ["scenario", "Сценарий"],
          ["campaign", "Кампания"],
          ["template", "Шаблон"],
        ] as const).map(([value, label]) => (
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${kind === value ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
            key={value}
            onClick={() => setKind(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <form action={submit} className="mt-4 space-y-3">
        {kind === "scenario" && (
          <>
            <Input name="name" placeholder="Название сценария" required />
            <select className="h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm" name="triggerKind">
              <option value="appointment">Запись</option><option value="reschedule">Перенос</option><option value="cancellation">Отмена</option><option value="callback">Callback</option><option value="urgent">Срочное обращение</option><option value="faq">Вопрос</option>
            </select>
          </>
        )}
        {kind === "campaign" && (
          <>
            <Input name="name" placeholder="Название кампании" required />
            <Textarea name="purpose" placeholder="Цель кампании" required />
            <div className="grid grid-cols-2 gap-3">
              <select className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm" name="channel"><option value="voice">Голос</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="telegram">Telegram</option><option value="email">Email</option></select>
              <select className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm" name="locale"><option value="kk">Қазақша</option><option value="ru">Русский</option><option value="en">English</option></select>
            </div>
          </>
        )}
        {kind === "template" && (
          <>
            <select className="h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm" name="code">
              {notificationTemplateCodes.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm" name="channel">
                {notificationChannels.map((channel) => (
                  <option key={channel} value={channel}>{notificationChannelLabels[channel]}</option>
                ))}
              </select>
              <select className="h-10 rounded-[10px] border border-input bg-white px-3 text-sm" name="locale"><option value="kk">Қазақша</option><option value="ru">Русский</option><option value="en">English</option></select>
            </div>
            <Input name="subject" placeholder="Тема (если применимо)" />
            <Textarea name="body" placeholder="Текст с переменными: {{patientName}}, {{doctorName}}, {{startsAt}}, {{supportPhone}}" required />
          </>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button disabled={loading} type="submit">
          {loading ? <SpinnerGap className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Создать черновик
        </Button>
      </form>
    </div>
  );
}
