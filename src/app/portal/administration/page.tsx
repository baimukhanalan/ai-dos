import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/page-header";
import { EmptyModule, ModuleSection, StatusPill } from "@/components/portal/module-section";
import { getAdministrationHub } from "@/lib/dal/portal";

export const metadata: Metadata = { title: "Управление" };
export const dynamic = "force-dynamic";

export default async function AdministrationPage() {
  const data = await getAdministrationHub();
  const subscription = data.subscription;
  return (
    <>
      <PageHeader
        eyebrow="Контроль платформы"
        title="Управление"
        description="Подписка, потребление, аудит действий, состояние интеграций и функциональные флаги вашей клиники."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-[16px] border border-border bg-white/75 p-5"><p className="text-xs text-muted-foreground">Тариф</p><p className="mt-2 text-xl font-semibold">{subscription ? String(subscription.plan) : "Не выбран"}</p>{subscription && <div className="mt-3"><StatusPill status={String(subscription.status)} /></div>}</div>
        <div className="rounded-[16px] border border-border bg-white/75 p-5"><p className="text-xs text-muted-foreground">Метрик использования</p><p className="mt-2 text-xl font-semibold">{data.usage.length}</p><p className="mt-2 text-xs text-muted-foreground">Счётчики хранятся по периодам</p></div>
        <div className="rounded-[16px] border border-border bg-white/75 p-5"><p className="text-xs text-muted-foreground">Событий аудита</p><p className="mt-2 text-xl font-semibold">{data.audit.length}</p><p className="mt-2 text-xs text-muted-foreground">Последние 50 действий</p></div>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ModuleSection count={data.integrationHealth.length} description="Ошибки за 24 часа и последняя проверка провайдера." title="Здоровье интеграций">
          {data.integrationHealth.length ? data.integrationHealth.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.provider)}><div><p className="font-semibold">{String(item.provider)}</p><p className="mt-1 text-xs text-muted-foreground">{String(item.mode)} · ошибок за 24 ч: {String(item.errors_24h)}</p></div><StatusPill status={String(item.status)} /></article>
          )) : <EmptyModule>Интеграции ещё не настроены.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.flags.length} description="Постепенное включение функций для клиники без повторного деплоя." title="Функциональные флаги">
          {data.flags.length ? data.flags.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.key)}><div><p className="font-semibold">{String(item.key)}</p><p className="mt-1 text-xs text-muted-foreground">Обновлено {new Date(String(item.updated_at)).toLocaleString("ru-KZ")}</p></div><StatusPill status={item.enabled ? "active" : "disabled"} /></article>
          )) : <EmptyModule>Специальных флагов для клиники нет.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.usage.length} description="Звонки, минуты, сообщения и AI-токены по расчётным периодам." title="Использование">
          {data.usage.length ? data.usage.map((item, index) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={`${String(item.metric)}-${index}`}><div><p className="font-semibold">{String(item.metric)}</p><p className="mt-1 text-xs text-muted-foreground">Период с {new Date(String(item.period_start)).toLocaleDateString("ru-KZ")}</p></div><p className="font-mono text-sm font-semibold">{String(item.value)}</p></article>
          )) : <EmptyModule>Счётчики появятся после первых реальных сессий.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.audit.length} description="Кто, когда и какой объект изменил. Медицинские данные в журнал не дублируются." title="Журнал аудита">
          {data.audit.length ? data.audit.map((item) => (
            <article className="border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}><p className="font-semibold">{String(item.action)}</p><p className="mt-1 text-xs text-muted-foreground">{String(item.actor_name || "Система")} · {String(item.resource_type)} · {new Date(String(item.created_at)).toLocaleString("ru-KZ")}</p></article>
          )) : <EmptyModule>Журнал пока пуст.</EmptyModule>}
        </ModuleSection>
      </div>
    </>
  );
}
