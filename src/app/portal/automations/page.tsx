import type { Metadata } from "next";
import Link from "next/link";
import { AutomationCreate } from "@/components/portal/automation-create";
import { PageHeader } from "@/components/portal/page-header";
import { EmptyModule, ModuleSection, StatusPill } from "@/components/portal/module-section";
import { getAutomationHub } from "@/lib/dal/portal";
import { deliveryReadiness } from "@/lib/notifications/dispatcher";
import { notificationChannelLabels } from "@/lib/notifications/templates";

export const metadata: Metadata = { title: "Автоматизация" };
export const dynamic = "force-dynamic";

function Row({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
      <StatusPill status={status} />
    </article>
  );
}

const misStateLabels: Record<string, string> = {
  pending: "В очереди на перенос",
  syncing: "Переносится",
  synced: "В МИС",
  failed: "Нужен сотрудник",
  not_required: "Внешней МИС нет",
};

const deliveryStatusLabels: Record<string, string> = {
  queued: "В очереди",
  sending: "Отправляется",
  sent: "Доставлено",
  failed: "Ошибка",
  blocked: "Ждёт провайдера",
  cancelled: "Отменено",
};

export default async function AutomationsPage() {
  const data = await getAutomationHub();
  const readiness = deliveryReadiness();
  const stats = new Map(data.deliveryStats.map((row) => [row.status, row.count]));
  return (
    <>
      <PageHeader
        eyebrow="Сценарии и коммуникации"
        title="Автоматизация"
        description="Версионируемые сценарии, массовые кампании, шаблоны уведомлений, интеграции и очередь событий — с согласиями, аудитом и безопасной публикацией."
      />
      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[16px] border border-border bg-primary px-6 py-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Контур исполнения</p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold">Черновик → проверка → версия → публикация → журнал исполнения</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">По умолчанию новые сценарии и кампании не запускаются автоматически. Это защищает пациентов от случайной рассылки или звонка.</p>
        </div>
        <AutomationCreate />
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["sent", "queued", "blocked", "failed"] as const).map((status) => (
          <div className="rounded-[16px] border border-border bg-white/75 p-5" key={status}>
            <p className="text-xs text-muted-foreground">{deliveryStatusLabels[status]}</p>
            <p className="mt-2 text-xl font-semibold">{stats.get(status) || 0}</p>
            <p className="mt-2 text-xs text-muted-foreground">Уведомления за 30 дней</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ModuleSection count={readiness.channels.filter((item) => item.configured).length} description="Каналы включаются автоматически, как только в окружении появляются учётные данные вашего шлюза. До этого сообщения ждут в статусе «blocked» и не теряются." title="Каналы доставки">
          {readiness.channels.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={item.channel}>
              <div className="min-w-0">
                <p className="font-semibold">{notificationChannelLabels[item.channel]}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.provider}
                  {item.requirements.length ? ` · ${item.requirements.join(", ")}` : " · внутренний канал"}
                </p>
              </div>
              <StatusPill status={item.configured ? "active" : "pending"} />
            </article>
          ))}
        </ModuleSection>
        <ModuleSection count={data.misSyncStats.reduce((total, row) => total + row.count, 0)} description="Пациенту запись подтверждается из базы AI Dos, а во внешнюю МИС она переносится фоном с перечитыванием после сохранения. Сбой становится задачей сотруднику — запись при этом остаётся действительной." title="Перенос записей в МИС">
          {data.misSyncStats.length ? data.misSyncStats.map((row) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={row.state}>
              <div className="min-w-0">
                <p className="font-semibold">{misStateLabels[row.state] || row.state}</p>
                <p className="mt-1 text-xs text-muted-foreground">Записи за последние 7 дней и будущие</p>
              </div>
              <p className="font-mono text-sm font-semibold">{row.count}</p>
            </article>
          )) : <EmptyModule>Записей пока нет.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.deliveryAttempts.length} description="Каждая попытка провайдера с кодом ошибки и длительностью — журнал, по которому видно, где именно срывается доставка." title="Попытки доставки">
          {data.deliveryAttempts.length ? data.deliveryAttempts.map((item) => (
            <Row key={String(item.id)} title={`${String(item.template_code)} · ${String(item.channel)}`} detail={`${String(item.provider)} · попытка ${String(item.attempt)}${item.error_code ? ` · ${String(item.error_code)}` : ""} · ${String(item.duration_ms ?? 0)} мс`} status={String(item.status)} />
          )) : <EmptyModule>Попыток доставки ещё не было.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.scenarios.length} description="Запись, перенос, отмена, callback, FAQ и срочные обращения." title="Сценарии">
          {data.scenarios.length ? data.scenarios.map((item) => (
            <Row key={String(item.id)} title={String(item.name)} detail={`${String(item.trigger_kind)} · версия ${String(item.active_version || 0)} · всего ${String(item.version_count)}`} status={String(item.status)} />
          )) : <EmptyModule>Создайте первый черновик сценария справа. Он не начнёт работу без публикации.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.campaigns.length} description="Обзвоны и сообщения только пациентам с подходящим согласием." title="Кампании">
          {data.campaigns.length ? data.campaigns.map((item) => (
            <Row key={String(item.id)} title={String(item.name)} detail={`${String(item.channel)} · ${String(item.locale)} · аудитория ${String(item.audience_count)} · доставлено ${String(item.delivered_count)}`} status={String(item.status)} />
          )) : <EmptyModule>Кампаний ещё нет. При запуске система исключит opt-out контакты.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.templates.length} description="RU, KK и EN версии подтверждений, напоминаний и отмен." title="Шаблоны уведомлений">
          {data.templates.length ? data.templates.map((item) => (
            <Row key={String(item.id)} title={`${String(item.code)} · ${String(item.locale).toUpperCase()}`} detail={`${String(item.channel)} · версия ${String(item.version)}`} status={String(item.status)} />
          )) : <EmptyModule>Шаблоны ещё не создавались.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.integrations.length} description="DAMUMED подключается только через официальный API; тестовый адаптер изолирован." title="Интеграции">
          {data.integrations.length ? data.integrations.map((item) => (
            <Row key={String(item.id)} title={String(item.provider)} detail={`режим ${String(item.mode)} · проверка ${item.last_checked_at ? new Date(String(item.last_checked_at)).toLocaleString("ru-KZ") : "ещё не проводилась"}`} status={String(item.status)} />
          )) : <EmptyModule>Официальные учётные данные DAMUMED пока не добавлены.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.outbox.length} description="Надёжная доставка событий с повторными попытками и идемпотентностью." title="Очередь событий">
          {data.outbox.length ? data.outbox.map((item) => (
            <Row key={String(item.id)} title={String(item.topic)} detail={`${String(item.aggregate_type)} · попыток ${String(item.attempts)}`} status={String(item.status)} />
          )) : <EmptyModule>Очередь пуста — необработанных событий нет.</EmptyModule>}
        </ModuleSection>
        <ModuleSection count={data.articles.length} description="Проверенные ответы, которые можно использовать в голосе и чате." title="База знаний">
          {data.articles.length ? data.articles.map((item) => (
            <Row key={String(item.id)} title={String(item.title)} detail={`Обновлено ${new Date(String(item.updated_at)).toLocaleDateString("ru-KZ")}`} status={String(item.status)} />
          )) : <EmptyModule><Link className="font-semibold text-primary underline-offset-4 hover:underline" href="/portal/knowledge">Добавьте проверенные материалы</Link>, прежде чем включать ответы пациентам.</EmptyModule>}
        </ModuleSection>
      </div>
    </>
  );
}
