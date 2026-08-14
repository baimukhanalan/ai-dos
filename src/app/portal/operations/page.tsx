import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/page-header";
import {
  EmptyModule,
  ModuleSection,
  StatusPill,
} from "@/components/portal/module-section";
import { EscalationActions } from "@/components/portal/escalation-actions";
import { NotificationActions } from "@/components/portal/notification-actions";
import { OperationStatusButton } from "@/components/portal/operation-status-button";
import { UrgentDecision } from "@/components/portal/urgent-decision";
import { WaitlistOfferActions } from "@/components/portal/waitlist-offer-actions";
import { listBookingSessions } from "@/lib/dal/booking";
import { getOperationsHub } from "@/lib/dal/portal";
import { requirePageRoles } from "@/lib/dal/auth";
import { lostReasonLabels } from "@/lib/analytics/revenue";

const escalationReasonLabels: Record<string, string> = {
  emergency: "Экстренный случай",
  complaint: "Жалоба",
  human_request: "Просит человека",
  sensitive_data: "Чувствительные данные",
  no_slot: "Нет свободного слота",
  out_of_scope: "Вне компетенции AI",
  identity_unverified: "Личность не подтверждена",
  other: "Прочее",
};

const bookingStageLabels: Record<string, string> = {
  need_doctor: "Уточняем врача",
  need_slot: "Подбираем время",
  confirming: "Ждём подтверждения",
  done: "Завершён",
};

const bookingOutcomeLabels: Record<string, string> = {
  booked: "Записан",
  lost: "Не записался",
  escalated: "Передан человеку",
};

export const metadata: Metadata = { title: "Операции" };
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requirePageRoles(["clinic_admin", "operator"]);
  const [data, bookingSessions] = await Promise.all([
    getOperationsHub(),
    listBookingSessions(),
  ]);
  const date = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: data.user.timezone,
    dateStyle: "short",
    timeStyle: "short",
  });
  return (
    <>
      <PageHeader
        eyebrow="Первая линия регистратуры"
        title="Операции"
        description="Активные и пропущенные звонки, callback, лист ожидания, срочные обращения, задачи и уведомления в едином рабочем контуре."
      />
      <ModuleSection
        count={data.escalations.length}
        description="AI передал разговор человеку. В карточке уже есть распознанный запрос, причина, сводка и что ассистент успел сделать — продолжайте с этой точки."
        id="escalations"
        title="Эскалации"
      >
        {data.escalations.length ? (
          data.escalations.map((item) => {
            const context = (item.patient_context || {}) as {
              name?: string | null;
              phone?: string | null;
              language?: string | null;
            };
            const actions = (item.attempted_actions || []) as Array<{ action: string; result: string }>;
            return (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{escalationReasonLabels[String(item.reason)] || String(item.reason)}</p>
                    <StatusPill status={String(item.priority)} />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{String(item.channel)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {String(context.name || item.patient_name || "Пациент не идентифицирован")}
                    {context.phone ? ` · ${String(context.phone)}` : ""}
                    {context.language ? ` · ${String(context.language)}` : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6" style={{ maxHeight: 120, overflow: "hidden" }}>
                    {String(item.summary)}
                  </p>
                  {actions.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      AI уже сделал: {actions.map((a) => a.result).join("; ")}
                    </p>
                  )}
                </div>
                <EscalationActions id={String(item.id)} />
              </article>
            );
          })
        ) : (
          <EmptyModule>Открытых эскалаций нет. Здесь появятся разговоры, которые AI передал человеку.</EmptyModule>
        )}
      </ModuleSection>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ModuleSection
          count={bookingSessions.filter((item) => !item.outcome).length}
          description="AI ведёт пациента к записи и фиксирует исход каждой попытки — включая причину, по которой запись не состоялась."
          id="booking"
          title="Диалоги записи"
        >
          {bookingSessions.length ? (
            bookingSessions.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={item.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.patientName || "Пациент не идентифицирован"}</p>
                    {item.outcome && <StatusPill status={item.outcome} />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.doctorName || "Врач не выбран"} ·{" "}
                    {item.outcome
                      ? bookingOutcomeLabels[item.outcome] || item.outcome
                      : bookingStageLabels[item.stage] || item.stage}
                    {item.lostReason ? ` · ${lostReasonLabels[item.lostReason] || item.lostReason}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {date.format(new Date(item.updatedAt))} · реплик в диалоге: {item.turns}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <EmptyModule>
              Разговорных записей ещё не было. Здесь появятся диалоги, которые AI довёл до записи — и те, что закрылись с причиной.
            </EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.calls.length}
          description="Входящие, исходящие, пропущенные и переданные сотруднику звонки."
          id="calls"
          title="Звонки"
        >
          {data.calls.length ? (
            data.calls.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div>
                  <p className="font-semibold">{String(item.from_number || item.to_number || "Скрытый номер")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{date.format(new Date(String(item.started_at)))} · {String(item.direction)}</p>
                </div>
                <StatusPill status={String(item.status)} />
              </article>
            ))
          ) : (
            <EmptyModule>Звонков ещё нет. Подключите номер в разделе «Голос» или используйте микрофонный тест.</EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.callbacks.length}
          description="Автоматические и ручные задачи на обратный звонок."
          id="callbacks"
          title="Callback"
        >
          {data.callbacks.length ? (
            data.callbacks.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{String(item.name)}</p>
                    <StatusPill status={String(item.status)} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{String(item.phone)} · {String(item.reason)}</p>
                </div>
                {item.status !== "done" && item.status !== "cancelled" && (
                  <OperationStatusButton id={String(item.id)} label="Готово" resource="callbacks" status="done" />
                )}
              </article>
            ))
          ) : (
            <EmptyModule>Очередь callback пуста.</EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.waitlist.length}
          description="Пациенты, которым система предложит первый подходящий освободившийся слот."
          id="waitlist"
          title="Лист ожидания"
        >
          {data.waitlist.length ? (
            data.waitlist.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div>
                  <p className="font-semibold">{String(item.patient_name)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{String(item.doctor_name || item.service_name || "Любой подходящий специалист")}</p>
                </div>
                <StatusPill status={String(item.status)} />
              </article>
            ))
          ) : (
            <EmptyModule>Лист ожидания пуст. Записи появятся после согласия пациента.</EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.offers.length}
          description="Воркер сам находит освободившийся слот и держит предложение до срока. Подтверждение создаёт запись без двойного бронирования."
          id="offers"
          title="Предложения слотов"
        >
          {data.offers.length ? (
            data.offers.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{String(item.patient_name)}</p>
                    <StatusPill status={String(item.status)} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {String(item.doctor_name || "Специалист не указан")} · {date.format(new Date(String(item.starts_at)))} · {String(item.duration_minutes)} мин
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Канал {String(item.channel)} · действует до {date.format(new Date(String(item.expires_at)))}
                  </p>
                </div>
                {item.status === "sent" && <WaitlistOfferActions id={String(item.id)} />}
              </article>
            ))
          ) : (
            <EmptyModule>Активных предложений нет. Они появятся, как только у врача освободится подходящее время.</EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.urgentRequests.filter((item) => item.status === "pending").length}
          description="Свободного времени нет, но пациента можно принять вне графика. Решение за человеком: вписать, предложить штатное время или отказать — AI продолжит разговор с этим ответом."
          id="urgent"
          title="Срочные запросы"
        >
          {data.urgentRequests.length ? (
            data.urgentRequests.map((item) => (
              <article className="grid gap-3 border-b border-border/70 px-5 py-4 last:border-0 sm:grid-cols-[1fr_auto]" key={String(item.id)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{String(item.patient_name || "Пациент не идентифицирован")}</p>
                    <StatusPill status={String(item.status)} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{String(item.reason)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(item.doctor_name || "Врач не выбран")} · {date.format(new Date(String(item.requested_at)))}
                    {item.proposed_starts_at
                      ? ` · предложено ${date.format(new Date(String(item.proposed_starts_at)))}`
                      : ""}
                  </p>
                  {item.resolution_note && (
                    <p className="mt-1 text-xs text-muted-foreground">{String(item.resolution_note)}</p>
                  )}
                </div>
                {item.status === "pending" && (
                  <UrgentDecision
                    doctorId={item.doctor_id ? String(item.doctor_id) : null}
                    id={String(item.id)}
                    timezone={data.user.timezone}
                  />
                )}
              </article>
            ))
          ) : (
            <EmptyModule>Новых срочных запросов нет.</EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.tasks.length}
          description="Передачи сотруднику, нестандартные случаи и ручные проверки."
          id="tasks"
          title="Задачи"
        >
          {data.tasks.length ? (
            data.tasks.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{String(item.title)}</p>
                    <StatusPill status={String(item.status)} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{String(item.description || item.kind)}</p>
                </div>
                {item.status !== "done" && item.status !== "cancelled" && (
                  <OperationStatusButton id={String(item.id)} label="Готово" resource="tasks" status="done" />
                )}
              </article>
            ))
          ) : (
            <EmptyModule>Открытых задач нет.</EmptyModule>
          )}
        </ModuleSection>

        <ModuleSection
          count={data.notifications.length}
          description="Подтверждения, напоминания, отмены и предложения свободных слотов."
          id="notifications"
          title="Уведомления"
        >
          {data.notifications.length ? (
            data.notifications.map((item) => (
              <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{String(item.template_code)}</p>
                    <StatusPill status={String(item.status)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(item.patient_name || "Системное уведомление")} · {String(item.channel)} · {date.format(new Date(String(item.scheduled_at)))}
                    {Number(item.attempts) > 0 ? ` · попыток ${String(item.attempts)}` : ""}
                  </p>
                  {item.last_error && (
                    <p className="mt-1 text-xs text-destructive">{String(item.last_error)}</p>
                  )}
                </div>
                <NotificationActions id={String(item.id)} status={String(item.status)} />
              </article>
            ))
          ) : (
            <EmptyModule>Уведомления ещё не создавались.</EmptyModule>
          )}
        </ModuleSection>
      </div>
    </>
  );
}
