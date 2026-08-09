"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeSlash, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            fullName: form.get("fullName"),
            clinicName: form.get("clinicName"),
            email: form.get("email"),
            password: form.get("password"),
            consent: form.get("consent") === "on",
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message || "Не удалось войти.");
      router.replace("/portal");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось выполнить запрос.",
      );
      setPending(false);
    }
  }

  const isRegister = mode === "register";
  return (
    <div className="mx-auto max-w-[690px] lg:mx-0 lg:-translate-y-8">
      <h1 className="font-editorial text-[clamp(3rem,3.6vw,3.25rem)] leading-[.98] text-[#17241f]">
        {isRegister ? "Создайте портал клиники" : "Войдите в портал клиники"}
      </h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">
        {isRegister
          ? "Запустите защищённое рабочее пространство и проверьте AI Dos в sandbox-режиме."
          : "Продолжите работу с обращениями, расписанием и командой."}
      </p>
      <form className="mt-9 space-y-5" onSubmit={submit}>
        {isRegister && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Ваше имя"
              name="fullName"
              placeholder="Алия Касымова"
              autoComplete="name"
            />
            <Field
              label="Название клиники"
              name="clinicName"
              placeholder="Densa Clinic"
              autoComplete="organization"
            />
          </div>
        )}
        <Field
          label="Рабочая почта"
          name="email"
          type="email"
          placeholder="name@clinic.kz"
          autoComplete="email"
        />
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="password">
            Пароль
          </label>
          <div className="relative">
            <Input
              className="h-13 rounded-[10px] border-input bg-white/80 pr-12 text-base focus-visible:ring-primary/20"
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder={
                isRegister ? "Минимум 10 символов и цифра" : "Введите пароль"
              }
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-primary"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? (
                <EyeSlash className="size-5" />
              ) : (
                <Eye className="size-5" />
              )}
            </button>
          </div>
        </div>
        {isRegister && (
          <label className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
            <input
              className="mt-1 size-4 accent-[#075b3b]"
              type="checkbox"
              name="consent"
              required
            />
            <span>
              Я подтверждаю создание рабочего пространства и согласие на
              обработку данных в рамках{" "}
              <b className="font-medium text-foreground">sandbox‑проверки</b>.
            </span>
          </label>
        )}
        {error && (
          <p
            className="rounded-[10px] border border-[#efb8af] bg-[#fff2ef] px-4 py-3 text-sm text-[#a33b2d]"
            role="alert"
          >
            {error}
          </p>
        )}
        <Button
          className="h-13 w-full rounded-[10px] text-base font-semibold"
          disabled={pending}
          type="submit"
        >
          {pending && <SpinnerGap className="size-5 animate-spin" />}
          {isRegister ? "Создать клинику" : "Войти"}
        </Button>
      </form>
      <div className="mt-7 border-t border-border pt-6 text-sm text-muted-foreground">
        {isRegister ? (
          <>
            Уже есть доступ?{" "}
            <Link
              className="font-semibold text-primary hover:underline"
              href="/login"
            >
              Войти в портал
            </Link>
          </>
        ) : (
          <>
            Нет рабочего пространства?{" "}
            <Link
              className="font-semibold text-primary hover:underline"
              href="/register"
            >
              Создать клинику
            </Link>
          </>
        )}
      </div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        AI Dos не ставит диагнозы. DAMUMED будет подключён только через
        официальный API после получения доступа клиники.
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <Input
        className="h-13 rounded-[10px] border-input bg-white/80 text-base focus-visible:ring-primary/20"
        id={name}
        name={name}
        required
        {...props}
      />
    </div>
  );
}
