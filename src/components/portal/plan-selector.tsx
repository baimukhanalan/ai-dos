"use client";

import { useState } from "react";
import { CheckCircle, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKzt, type Plan } from "@/lib/billing/plans";

export function PlanSelector({
  plans,
  currentPlan,
  billingEmail,
}: {
  plans: Plan[];
  currentPlan: string;
  billingEmail: string | null;
}) {
  const [selected, setSelected] = useState(currentPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selected,
          billingEmail: String(formData.get("billingEmail") || ""),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(payload.error?.message || "Не удалось сохранить тариф.");
      }
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка сохранения.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const active = selected === plan.code;
          return (
            <button
              className={`rounded-[16px] border p-5 text-left transition ${active ? "border-primary bg-[#eaf4ee]" : "border-border bg-white/75 hover:border-primary/40"}`}
              key={plan.code}
              onClick={() => setSelected(plan.code)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{plan.name}</h3>
                {plan.code === currentPlan && (
                  <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                    текущий
                  </span>
                )}
              </div>
              <p className="mt-2 text-xl font-semibold">
                {plan.priceKzt === null
                  ? "По договору"
                  : plan.priceKzt === 0
                    ? "Бесплатно"
                    : `${formatKzt(plan.priceKzt)} / мес`}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {plan.description}
              </p>
              <ul className="mt-3 space-y-1.5">
                {plan.features.map((feature) => (
                  <li className="flex gap-2 text-xs leading-5" key={feature}>
                    <CheckCircle className="mt-0.5 size-3.5 shrink-0 text-primary" weight="fill" />
                    {feature}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <form action={submit} className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-[280px]"
          defaultValue={billingEmail || ""}
          name="billingEmail"
          placeholder="Email для счёта"
          type="email"
        />
        <Button disabled={loading || selected === currentPlan} type="submit">
          {loading && <SpinnerGap className="size-4 animate-spin" />}
          Зафиксировать тариф
        </Button>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
