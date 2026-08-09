"use client";

import { useState } from "react";
import { CheckCircle, FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  existing?: {
    e164: string;
    label: string;
    provider: string;
    voice: string;
    languages: string[];
    status: string;
  };
};

export function PhoneNumberForm({ existing }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/telephony/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          e164: formData.get("e164"),
          label: formData.get("label"),
          provider: formData.get("provider"),
          voice: formData.get("voice"),
          greeting: formData.get("greeting") || undefined,
          languages: String(formData.get("languages") || "kk,ru,en")
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
          active: formData.get("active") === "on",
        }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message || "Не удалось сохранить номер.");
      }
      setMessage("Номер и голосовой профиль сохранены.");
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось сохранить номер.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-muted-foreground">
          Телефон в E.164
          <Input
            className="mt-2"
            defaultValue={existing?.e164}
            name="e164"
            placeholder="+77001234567"
            required
          />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          Название линии
          <Input
            className="mt-2"
            defaultValue={existing?.label || "Основная линия"}
            name="label"
            required
          />
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          SIP‑провайдер
          <select
            className="mt-2 h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
            defaultValue={existing?.provider || "sip"}
            name="provider"
          >
            <option value="sip">Другой SIP trunk</option>
            <option value="twilio">Twilio</option>
            <option value="zadarma">Zadarma</option>
            <option value="binotel">Binotel</option>
            <option value="asterisk">Asterisk</option>
            <option value="other">Другой оператор</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-muted-foreground">
          Голос
          <select
            className="mt-2 h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
            defaultValue={existing?.voice || "marin"}
            name="voice"
          >
            <option value="marin">Marin</option>
            <option value="cedar">Cedar</option>
            <option value="coral">Coral</option>
            <option value="sage">Sage</option>
            <option value="shimmer">Shimmer</option>
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-muted-foreground">
        Языки через запятую
        <Input
          className="mt-2"
          defaultValue={existing?.languages?.join(",") || "kk,ru,en"}
          name="languages"
        />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        Приветствие клиники
        <Input
          className="mt-2"
          name="greeting"
          placeholder="Здравствуйте! Вы позвонили в клинику…"
        />
      </label>
      <label className="flex items-start gap-3 text-xs leading-5 text-muted-foreground">
        <input
          className="mt-0.5 size-4 accent-[#075b3b]"
          defaultChecked={existing?.status === "active"}
          name="active"
          type="checkbox"
        />
        Активировать входящие звонки после того, как SIP‑транк и OpenAI webhook
        полностью настроены.
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {message && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle className="size-4" weight="fill" /> {message}
        </p>
      )}
      <Button disabled={loading} type="submit">
        {loading ? (
          <SpinnerGap className="size-4 animate-spin" />
        ) : (
          <FloppyDisk className="size-4" />
        )}
        Сохранить линию
      </Button>
    </form>
  );
}
