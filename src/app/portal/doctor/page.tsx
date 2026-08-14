import type { Metadata } from "next";
import { DoctorAvailabilityForm } from "@/components/portal/doctor-availability-form";
import { EmptyModule, ModuleSection, StatusPill } from "@/components/portal/module-section";
import { PageHeader } from "@/components/portal/page-header";
import { UrgentDecision } from "@/components/portal/urgent-decision";
import { getDoctorHub } from "@/lib/dal/doctor";
import { requirePageRoles } from "@/lib/dal/auth";

export const metadata: Metadata = { title: "Кабинет врача" };
export const dynamic = "force-dynamic";

const weekday = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export default async function DoctorPage() {
  await requirePageRoles(["doctor"]);
  const data = await getDoctorHub();
  const doctor = data.doctor as Record<string, unknown>;
  const dateTime = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: data.user.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const dateOnly = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: data.user.timezone,
    dateStyle: "medium",
  });
  return (
    <>
      <PageHeader
        eyebrow="Личный рабочий контур"
        title={String(doctor.display_name)}
        description={`${String(doctor.specialty || "Врач")} · ${String(doctor.branch_name || "Филиал не указан")} · кабинет ${String(doctor.room || "—")}`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <ModuleSection count={data.appointments.length} description="Только ваши подтверждённые и удерживаемые записи." title="Предстоящие приёмы">
            {data.appointments.length ? data.appointments.map((item) => (
              <article className="grid gap-3 border-b border-border/70 px-5 py-4 last:border-0 sm:grid-cols-[180px_1fr_auto]" key={String(item.id)}>
                <p className="font-semibold text-primary">{dateTime.format(new Date(String(item.starts_at)))}</p>
                <div><p className="font-semibold">{String(item.patient_name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.service_name || "Приём")} · {String(item.reason || "Причина не указана")}</p></div>
                <StatusPill status={String(item.status)} />
              </article>
            )) : <EmptyModule>Предстоящих приёмов нет.</EmptyModule>}
          </ModuleSection>

          <ModuleSection count={data.urgentRequests.length} description="Минимально необходимые данные пациента и причина запроса." title="Запросы вне графика">
            {data.urgentRequests.length ? data.urgentRequests.map((item) => (
              <article className="grid gap-4 border-b border-border/70 px-5 py-4 last:border-0 lg:grid-cols-[1fr_320px]" key={String(item.id)}>
                <div><p className="font-semibold">{String(item.patient_name || "Пациент")}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{String(item.reason)}</p></div>
                {item.status === "pending" ? <UrgentDecision doctorId={data.doctorId} id={String(item.id)} timezone={data.user.timezone} /> : <StatusPill status={String(item.status)} />}
              </article>
            )) : <EmptyModule>Новых запросов нет.</EmptyModule>}
          </ModuleSection>

          <ModuleSection count={data.rules.length} description="Базовый еженедельный график из живой БД." title="Мой график">
            {data.rules.length ? data.rules.map((item) => (
              <article className="grid grid-cols-[80px_1fr_auto] gap-3 border-b border-border/70 px-5 py-3 last:border-0" key={String(item.id)}>
                <p className="font-semibold">{weekday[Number(item.weekday)]}</p>
                <p>{String(item.starts_at).slice(0, 5)}–{String(item.ends_at).slice(0, 5)}</p>
                <span className="text-xs text-muted-foreground">{String(item.slot_minutes)} мин</span>
              </article>
            )) : <EmptyModule>Рабочий график ещё не настроен.</EmptyModule>}
          </ModuleSection>
        </div>

        <aside className="space-y-5">
          <DoctorAvailabilityForm />
          <ModuleSection count={data.exceptions.length} description="Отпуск, перерывы, блокировки и дополнительные окна." title="Изменения доступности">
            {data.exceptions.length ? data.exceptions.map((item) => (
              <article className="border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
                <div className="flex items-center justify-between gap-3"><p className="font-semibold">{dateOnly.format(new Date(String(item.exception_date)))}</p><StatusPill status={item.available ? "active" : "paused"} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{item.starts_at ? `${String(item.starts_at).slice(0, 5)}–${String(item.ends_at).slice(0, 5)}` : "Весь день"} · {String(item.reason || "Без комментария")}</p>
              </article>
            )) : <EmptyModule>Изменений доступности нет.</EmptyModule>}
          </ModuleSection>
          <ModuleSection count={data.notifications.length} description="Статусы уведомлений по вашим приёмам." title="Уведомления">
            {data.notifications.length ? data.notifications.map((item) => (
              <article className="border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}><p className="font-semibold">{String(item.template_code)}</p><div className="mt-2"><StatusPill status={String(item.status)} /></div></article>
            )) : <EmptyModule>Уведомлений нет.</EmptyModule>}
          </ModuleSection>
        </aside>
      </div>
    </>
  );
}
