"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeSlash, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PlatformLoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/platform/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "Не удалось войти.");
      }
      router.replace("/platform");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Нет связи с сервером.");
      setPending(false);
    }
  }

  return (
    <form className="mt-9 space-y-5" onSubmit={submit}>
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="platform-email">
          Email владельца платформы
        </label>
        <Input
          autoComplete="email"
          className="h-13 rounded-[10px] bg-white text-base"
          id="platform-email"
          name="email"
          placeholder="owner@ai-dos.kz"
          required
          type="email"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor="platform-password">
          Пароль
        </label>
        <div className="relative">
          <Input
            autoComplete="current-password"
            className="h-13 rounded-[10px] bg-white pr-12 text-base"
            id="platform-password"
            name="password"
            placeholder="Введите пароль"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>
      {error && (
        <p className="rounded-[10px] border border-[#efb8af] bg-[#fff2ef] px-4 py-3 text-sm text-[#a33b2d]" role="alert">
          {error}
        </p>
      )}
      <Button className="h-13 w-full rounded-[10px] text-base font-semibold" disabled={pending} type="submit">
        {pending && <SpinnerGap className="size-5 animate-spin" />}
        Войти в управление платформой
      </Button>
    </form>
  );
}
