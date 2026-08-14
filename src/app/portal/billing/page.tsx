import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/page-header";
import {
  ModuleSection,
  StatusPill,
} from "@/components/portal/module-section";
import { BrandingForm } from "@/components/portal/branding-form";
import { PlanSelector } from "@/components/portal/plan-selector";
import { getBillingOverview } from "@/lib/dal/billing";
import { requirePageRoles } from "@/lib/dal/auth";

export const metadata: Metadata = { title: "Тариф и бренд" };
export const dynamic = "force-dynamic";

const paymentStateLabels: Record<string, string> = {
  not_required: "Оплата не требуется",
  invoice_pending: "Счёт выставляется вручную",
  provider_pending: "Ожидает платёжного провайдера",
};

export default async function BillingPage() {
  await requirePageRoles(["clinic_admin"]);
  const data = await getBillingOverview();
  const paymentState = data.subscription?.payment_state || "not_required";

  return (
    <>
      <PageHeader
        eyebrow="Коммерческие условия"
        title="Тариф и бренд"
        description="Тариф, фактическое потребление за расчётный месяц и оформление портала под вашу клинику."
      />

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[16px] border border-border bg-white/75 p-5">
          <p className="text-xs text-muted-foreground">Текущий тариф</p>
          <p className="mt-2 text-xl font-semibold">{data.plan.name}</p>
          <div className="mt-3">
            <StatusPill status={String(data.subscription?.status || "trial")} />
          </div>
        </div>
        <div className="rounded-[16px] border border-border bg-white/75 p-5">
          <p className="text-xs text-muted-foreground">Оплата</p>
          <p className="mt-2 text-xl font-semibold">
            {paymentStateLabels[paymentState] || paymentState}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Платёж проходит вне AI Dos, пока владелец не подключит провайдера.
          </p>
        </div>
        <div className="rounded-[16px] border border-border bg-white/75 p-5">
          <p className="text-xs text-muted-foreground">Расчётный период</p>
          <p className="mt-2 text-xl font-semibold">
            {new Date().toLocaleDateString("ru-KZ", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Счётчики обнуляются в начале каждого месяца.
          </p>
        </div>
      </div>

      <section className="mb-5 overflow-hidden rounded-[16px] border border-border bg-white/75">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Тарифы</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Цены ориентировочные: коммерческие условия подтверждает владелец
            платформы. Выбор тарифа фиксирует намерение и попадает в аудит, но не
            списывает деньги.
          </p>
        </div>
        <div className="p-5">
          <PlanSelector
            billingEmail={data.subscription?.billing_email || null}
            currentPlan={data.plan.code}
            plans={data.plans}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ModuleSection
          count={data.usage.length}
          description="Фактическое потребление за текущий месяц против лимитов тарифа. Превышение не блокирует работу регистратуры — оно попадает в счёт."
          title="Использование"
        >
          {data.usage.map((item) => (
            <article className="border-b border-border/70 px-5 py-4 last:border-0" key={item.metric}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{item.label}</p>
                <p className="font-mono text-sm">
                  {item.used}
                  {item.limit === null ? " / ∞" : ` / ${item.limit}`}
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${item.state === "exceeded" ? "bg-destructive" : item.state === "warning" ? "bg-[#d8a04f]" : "bg-primary"}`}
                  style={{ width: `${Math.round(item.ratio * 100)}%` }}
                />
              </div>
              {item.state === "exceeded" && (
                <p className="mt-2 text-xs text-destructive">
                  Лимит тарифа исчерпан — перейдите на следующий тариф.
                </p>
              )}
            </article>
          ))}
        </ModuleSection>

        <ModuleSection
          description="Название, цвета и контакты подставляются в портал и в тексты уведомлений пациентам."
          title="Бренд клиники"
        >
          <BrandingForm branding={data.branding} />
        </ModuleSection>
      </div>
    </>
  );
}
