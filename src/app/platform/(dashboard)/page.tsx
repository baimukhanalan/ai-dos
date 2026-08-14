import type { Metadata } from "next";
import { PlatformTenantTable, type PlatformTenantRow } from "@/components/platform/platform-tenant-table";
import { getPlatformOverview } from "@/lib/dal/platform";
import { platformPlanLabel, platformSubscriptionLabel } from "@/lib/platform-labels";

export const metadata: Metadata = { title: "Управление платформой" };
export const dynamic = "force-dynamic";

const issueLabels: Record<string, string> = {
  integration: "Интеграция",
  subscription: "Подписка",
  queue: "Очередь",
};

const auditLabels: Record<string, string> = {
  "platform.auth.login": "Super Admin вошёл в систему",
  "platform.tenant.status_changed": "Статус клиники изменён",
};

function HealthRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b border-border/70 py-4 last:border-0"><span className="font-medium">{label}</span><span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><span className={`size-2 rounded-full ${ready ? "bg-[#16834d]" : "bg-[#e99400]"}`} />{value}</span></div>;
}

export default async function PlatformPage() {
  const data = await getPlatformOverview();
  const totals = data.totals as Record<string, unknown>;
  const tenants = data.tenants.map((item) => ({
    id: String(item.id), name: String(item.name), slug: String(item.slug), status: String(item.status),
    plan: String(item.plan), subscriptionStatus: String(item.subscription_status), usageTotal: String(item.usage_total || 0),
    integrationTotal: Number(item.integration_total), integrationReady: Number(item.integration_ready), queuePending: Number(item.queue_pending), queueFailed: Number(item.queue_failed),
    lastActivity: new Date(String(item.last_activity_at)).toISOString(), protected: String(item.id) === data.admin.tenantId,
  })) satisfies PlatformTenantRow[];
  const time = new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div id="overview">
      <header>
        <h1 className="font-editorial text-[clamp(2.8rem,4vw,3.8rem)] leading-[.95] text-[#17241f]">Управление платформой</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Клиники и техническое состояние всех tenant в одном защищённом контуре.</p>
      </header>

      <section className="my-8 grid border-y border-border py-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [totals.tenant_count, "клиник"], [totals.active_count, "активны"], [totals.attention_count, "требуют внимания"], [`${totals.delivery_rate}%`, "доставка"],
        ].map(([value, label], index) => <div className={`px-2 py-3 sm:px-6 ${index ? "sm:border-l sm:border-border" : ""}`} key={String(label)}><p className={`font-editorial text-4xl ${index === 2 && Number(value) ? "text-[#c75b12]" : "text-primary"}`}>{String(value)}</p><p className="mt-1 text-sm text-muted-foreground">{String(label)}</p></div>)}
      </section>

      <PlatformTenantTable rows={tenants} />

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <section className="rounded-[14px] border border-border bg-white/70 p-5" id="queues">
          <div className="border-b border-border pb-4"><h2 className="font-editorial text-2xl">Требуют внимания</h2><p className="mt-1 text-xs text-muted-foreground">Ошибки интеграций, подписок и доставки.</p></div>
          <div className="divide-y divide-border/70">
            {data.attention.length ? data.attention.slice(0, 6).map((item) => <article className="py-4" key={`${String(item.kind)}:${String(item.tenant_id)}:${String(item.subject)}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{String(item.tenant_name)} · {String(item.subject)}</p><p className="mt-1 text-xs text-muted-foreground">{issueLabels[String(item.kind)] || String(item.kind)} · {String(item.detail)}</p></div><span className="size-2 shrink-0 rounded-full bg-[#e99400]" /></div></article>) : <p className="py-10 text-center text-sm text-muted-foreground">Критичных событий нет.</p>}
          </div>
        </section>

        <section className="rounded-[14px] border border-border bg-white/70 p-5" id="integrations">
          <div className="border-b border-border pb-4"><h2 className="font-editorial text-2xl">Состояние платформы</h2><p className="mt-1 text-xs text-muted-foreground">Фактическая готовность провайдеров.</p></div>
          <HealthRow label="Database" ready={data.health.database === "connected"} value="Подключено" />
          <HealthRow label="Gemini Live" ready={data.health.voice === "ready"} value={data.health.voice === "ready" ? "Готов" : "Нужен провайдер"} />
          <HealthRow label="Telephony provider" ready={data.health.telephony === "ready"} value={data.health.telephony === "ready" ? "Готов" : "Требуется настройка"} />
          <HealthRow label="DAMUMED official API" ready={false} value="Ожидает доступа" />
        </section>

        <section className="rounded-[14px] border border-border bg-white/70 p-5" id="audit">
          <div className="border-b border-border pb-4"><h2 className="font-editorial text-2xl">Последние события аудита</h2><p className="mt-1 text-xs text-muted-foreground">Только действия платформенного контура.</p></div>
          <div className="divide-y divide-border/70">
            {data.audit.length ? data.audit.slice(0, 6).map((item) => <article className="py-4" key={String(item.id)}><p className="text-sm font-semibold">{auditLabels[String(item.action)] || String(item.action)}</p><div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground"><span>{String(item.actor_name || "Система")}</span><time>{time.format(new Date(String(item.created_at)))}</time></div></article>) : <p className="py-10 text-center text-sm text-muted-foreground">События появятся после первого входа.</p>}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-[14px] border border-border bg-white/70 p-5" id="flags">
          <div className="border-b border-border pb-4"><h2 className="font-editorial text-2xl">Feature flags</h2><p className="mt-1 text-xs text-muted-foreground">Последние tenant-scoped переключатели.</p></div>
          {data.flags.length ? <div className="divide-y divide-border/70">{data.flags.slice(0, 8).map((item) => <div className="flex items-center justify-between gap-4 py-4" key={`${String(item.tenant_id)}:${String(item.key)}`}><div><p className="font-semibold">{String(item.key)}</p><p className="mt-1 text-xs text-muted-foreground">{String(item.tenant_name)}</p></div><span className="inline-flex items-center gap-2 text-sm"><span className={`size-2 rounded-full ${item.enabled ? "bg-[#16834d]" : "bg-[#8a918d]"}`} />{item.enabled ? "Включён" : "Выключен"}</span></div>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">Feature flags не созданы.</p>}
        </section>
        <section className="rounded-[14px] border border-border bg-white/70 p-5" id="subscriptions">
          <div className="border-b border-border pb-4"><h2 className="font-editorial text-2xl">Подписки и usage</h2><p className="mt-1 text-xs text-muted-foreground">Сводка по тарифам и текущему потреблению.</p></div>
          <div className="divide-y divide-border/70" id="usage">{tenants.slice(0, 8).map((tenant) => <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-4" key={tenant.id}><div><p className="font-semibold">{tenant.name}</p><p className="mt-1 text-xs text-muted-foreground">{platformSubscriptionLabel(tenant.subscriptionStatus)}</p></div><span className="text-sm">{platformPlanLabel(tenant.plan)}</span><span className="min-w-20 text-right text-sm font-semibold text-primary">{Number(tenant.usageTotal).toLocaleString("ru-KZ")}</span></div>)}</div>
        </section>
      </div>
    </div>
  );
}
