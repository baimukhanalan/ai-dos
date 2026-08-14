"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: form.get("password") }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setPending(false);
      setError(payload.error?.message || "Не удалось принять приглашение.");
      return;
    }
    router.replace(payload.data.role === "doctor" ? "/portal/doctor" : "/portal");
    router.refresh();
  }
  return (
    <div className="mx-auto max-w-[620px] lg:mx-0 lg:-translate-y-8">
      <h1 className="font-editorial text-[clamp(3rem,3.6vw,3.25rem)] leading-[.98] text-[#17241f]">
        Примите приглашение
      </h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">
        Создайте личный пароль. Доступ будет ограничен назначенной ролью и клиникой.
      </p>
      <form className="mt-9 space-y-5" onSubmit={submit}>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="password">
            Новый пароль
          </label>
          <Input
            autoComplete="new-password"
            className="h-13 rounded-[10px] border-input bg-white/80 text-base"
            id="password"
            minLength={10}
            name="password"
            placeholder="Минимум 10 символов и цифра"
            required
            type="password"
          />
        </div>
        {error && (
          <p className="rounded-[10px] border border-[#efb8af] bg-[#fff2ef] px-4 py-3 text-sm text-[#a33b2d]" role="alert">
            {error}
          </p>
        )}
        <Button className="h-13 w-full rounded-[10px] text-base font-semibold" disabled={pending} type="submit">
          {pending && <SpinnerGap className="size-5 animate-spin" />}
          Создать доступ
        </Button>
      </form>
    </div>
  );
}
