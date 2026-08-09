"use client";

import { useState } from "react";
import { FloppyDisk, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BrandingInput } from "@/lib/validation/billing";

export function BrandingForm({ branding }: { branding: BrandingInput }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/billing/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message || "Не удалось сохранить бренд.");
      }
      setSaved(true);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={submit} className="space-y-3 p-5">
      <label className="block text-xs font-semibold text-muted-foreground" htmlFor="displayName">
        Название в уведомлениях
      </label>
      <Input
        defaultValue={branding.displayName || ""}
        id="displayName"
        name="displayName"
        placeholder="Клиника «Аман»"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="primaryColor">
            Основной цвет
          </label>
          <Input
            className="mt-1"
            defaultValue={branding.primaryColor || ""}
            id="primaryColor"
            name="primaryColor"
            placeholder="#075b3b"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="accentColor">
            Акцентный цвет
          </label>
          <Input
            className="mt-1"
            defaultValue={branding.accentColor || ""}
            id="accentColor"
            name="accentColor"
            placeholder="#dff2ea"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="logoUrl">
          Логотип (https)
        </label>
        <Input
          className="mt-1"
          defaultValue={branding.logoUrl || ""}
          id="logoUrl"
          name="logoUrl"
          placeholder="https://clinic.kz/logo.svg"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="supportPhone">
            Телефон регистратуры
          </label>
          <Input
            className="mt-1"
            defaultValue={branding.supportPhone || ""}
            id="supportPhone"
            name="supportPhone"
            placeholder="+77001234567"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground" htmlFor="supportEmail">
            Email регистратуры
          </label>
          <Input
            className="mt-1"
            defaultValue={branding.supportEmail || ""}
            id="supportEmail"
            name="supportEmail"
            placeholder="info@clinic.kz"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground" htmlFor="locale">
          Язык по умолчанию
        </label>
        <select
          className="mt-1 h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
          defaultValue={branding.locale}
          id="locale"
          name="locale"
        >
          <option value="ru">Русский</option>
          <option value="kk">Қазақша</option>
          <option value="en">English</option>
        </select>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Телефон и название подставляются в тексты пациентам. Если телефон не
        указан, предложение позвонить в уведомление не попадёт.
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button disabled={loading} type="submit">
        {loading ? (
          <SpinnerGap className="size-4 animate-spin" />
        ) : (
          <FloppyDisk className="size-4" />
        )}
        {saved ? "Сохранено" : "Сохранить бренд"}
      </Button>
    </form>
  );
}
