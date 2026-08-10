import type { Metadata } from "next";
import {
  ChartBar,
  CheckCircle,
  UsersThree,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/portal/page-header";
import { getReports } from "@/lib/dal/portal";
import {
  getAutonomyStats,
  getBookingOutcomes,
  getDemandIntelligence,
  getRevenueOverview,
} from "@/lib/dal/analytics";
import {
  bookingCompletionRate,
  conversionRate,
  formatKztShort,
  lostDemandLabels,
  lostReasonLabels,
  totalLost,
} from "@/lib/analytics/revenue";
import type { PatientIntent } from "@/lib/ai/escalation";

export const metadata: Metadata = { title: "Отчёты" };
export const dynamic = "force-dynamic";

const intentLabels: Record<PatientIntent, string> = {
  book: "Запись",
  reschedule: "Перенос",
  cancel: "Отмена",
  schedule_info: "Расписание",
  price: "Цена",
  address: "Адрес",
  preparation: "Подготовка",
  find_doctor: "Подбор врача",
  appointment_info: "Моя запись",
  urgent: "Срочно",
  results: "Результаты",
  complaint: "Жалоба",
  human: "Оператор",
  other: "Прочее",
};
const languageLabels: Record<string, string> = { ru: "Русский", kk: "Қазақша", en: "English" };

export default async function ReportsPage() {
  const [{ summary, daily }, revenue, demand, autonomy, booking] = await Promise.all([
    getReports(),
    getRevenueOverview(),
    getDemandIntelligence(),
    getAutonomyStats(),
    getBookingOutcomes(),
  ]);
  const bookingClosed =
    booking.stats.booked + booking.stats.lost + booking.stats.escalated;
  const bookingCompletion = bookingCompletionRate(booking.stats);
  const reasonMax = Math.max(...booking.stats.reasons.map((item) => item.count), 1);
  const intentMax = Math.max(...demand.intents.map((i) => i.count), 1);
  const languageTotal = demand.languages.reduce((sum, l) => sum + l.count, 0) || 1;
  const conversion = Math.round(conversionRate(revenue.funnel) * 100);
  const lostSum = totalLost(revenue.lostDemand);
  const cards = [
    {
      icon: ChartBar,
      label: "Записей в месяце",
      value: summary.appointments_month ?? 0,
    },
    { icon: CheckCircle, label: "Предстоящих", value: summary.upcoming ?? 0 },
    { icon: XCircle, label: "Отменено", value: summary.cancelled_month ?? 0 },
    {
      icon: UsersThree,
      label: "Пациентов",
      value: summary.patients_total ?? 0,
    },
  ];
  const max = Math.max(...daily.map((item) => Number(item.appointments)), 1);
  return (
    <>
      <PageHeader
        eyebrow="Нагрузка клиники"
        title="Отчёты"
        description="Показатели строятся по tenant‑scoped данным живой базы. Sandbox-записи остаются помеченными в портале."
      />

      {/* Автономия AI: доля диалогов без передачи человеку. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Автономия AI",
            value: autonomy.autonomyRate === null ? "—" : `${Math.round(autonomy.autonomyRate * 100)}%`,
            hint: "Диалогов без передачи человеку",
          },
          { label: "Диалогов за месяц", value: String(autonomy.conversations), hint: "Всего обращений" },
          { label: "Передано человеку", value: String(autonomy.escalatedConversations), hint: "Диалогов с эскалацией" },
          { label: "Открытых эскалаций", value: String(autonomy.openNow), hint: "Ждут оператора сейчас" },
        ].map((item) => (
          <article className="rounded-[15px] border border-border bg-white/70 p-5" key={item.label}>
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-2 font-editorial text-4xl text-[#193229]">{item.value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{item.hint}</p>
          </article>
        ))}
      </div>

      {/* Выручка — то, что важно директору: не число звонков, а деньги. */}
      <section className="mb-5 rounded-[16px] border border-[#bcd5ca] bg-[#edf6f2] p-5 sm:p-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Выручка за месяц</p>
            <p className="mt-2 font-editorial text-5xl text-[#173d29] sm:text-6xl">
              {formatKztShort(revenue.capturedKzt)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Оценка снизу: завершённые визиты × цена услуги. Услуги без цены не учитываются.
            </p>
          </div>
          {lostSum > 0 && (
            <div className="rounded-[12px] border border-[#e2c6a0] bg-white/70 px-4 py-3">
              <p className="text-xs text-muted-foreground">Потенциально потеряно</p>
              <p className="mt-1 font-editorial text-2xl text-[#8a5a1c]">{formatKztShort(lostSum)}</p>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Диалогов", value: revenue.funnel.conversations },
            { label: "Записей создано", value: revenue.funnel.bookings },
            { label: "Визитов завершено", value: revenue.funnel.completed },
            { label: "Конверсия в запись", value: `${conversion}%` },
          ].map((item) => (
            <div className="rounded-[12px] bg-white/70 p-4" key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-editorial text-3xl text-[#193229]">{String(item.value)}</p>
            </div>
          ))}
        </div>
        {revenue.lostDemand.length > 0 && (
          <div className="mt-5 border-t border-[#c4dccf] pt-5">
            <p className="mb-3 text-sm font-semibold text-[#173d29]">Куда уходит спрос</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {revenue.lostDemand.map((item) => (
                <div className="flex items-center justify-between rounded-[10px] bg-white/60 px-4 py-2.5 text-sm" key={item.key}>
                  <span className="text-muted-foreground">{lostDemandLabels[item.key] || item.key}</span>
                  <span className="font-semibold">
                    {item.count}
                    {item.estimatedKzt > 0 ? ` · ~${formatKztShort(item.estimatedKzt)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/*
        Точные причины отказа. В отличие от блока «Куда уходит спрос» выше это
        не оценка по соседним таблицам, а исход, записанный booking-flow в тот
        момент, когда пациент отказался.
      */}
      <section className="mb-5 rounded-[16px] border border-border bg-white/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Почему пациенты не записались</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Факт из разговорной записи: причина фиксируется в момент отказа, а не выводится из отмен
            </p>
          </div>
          {bookingCompletion !== null && (
            <div className="rounded-[12px] border border-border bg-white/70 px-4 py-2.5">
              <p className="text-xs text-muted-foreground">Доведено до записи</p>
              <p className="mt-1 font-editorial text-2xl text-[#193229]">
                {Math.round(bookingCompletion * 100)}%
              </p>
            </div>
          )}
        </div>

        {bookingClosed + booking.stats.open === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            Данные появятся после первых разговорных записей через AI. Пока причины отказа доступны
            только как оценка в блоке «Куда уходит спрос».
          </p>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Записались", value: booking.stats.booked },
                { label: "Не записались", value: booking.stats.lost },
                { label: "Передано человеку", value: booking.stats.escalated },
                { label: "В диалоге сейчас", value: booking.stats.open },
              ].map((item) => (
                <div className="rounded-[12px] border border-border bg-white/60 p-4" key={item.label}>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 font-editorial text-3xl text-[#193229]">{item.value}</p>
                </div>
              ))}
            </div>

            {booking.stats.reasons.length > 0 && (
              <div className="mt-5 space-y-2.5 border-t border-border pt-5">
                {booking.stats.reasons.map((item) => (
                  <div className="flex items-center gap-3" key={item.reason}>
                    <span className="w-44 shrink-0 text-sm">
                      {lostReasonLabels[item.reason] || item.reason}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#c08a3e]"
                        style={{ width: `${(item.count / reasonMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-32 text-right text-sm font-semibold tabular-nums">
                      {item.count}
                      {item.lostKzt > 0 ? ` · ${formatKztShort(item.lostKzt)}` : ""}
                    </span>
                  </div>
                ))}
                <p className="pt-2 text-xs text-muted-foreground">
                  Сумма — оценка снизу: минимальная опубликованная цена услуг специальности врача.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {(demand.intents.length > 0 || demand.languages.length > 0) && (
        <div className="mb-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-[16px] border border-border bg-white/70 p-5 sm:p-6">
            <h2 className="font-semibold">Что спрашивают пациенты</h2>
            <p className="mt-1 text-xs text-muted-foreground">Распределение распознанных обращений за месяц</p>
            <div className="mt-5 space-y-2.5">
              {demand.intents.length ? demand.intents.map((item) => (
                <div className="flex items-center gap-3" key={item.intent}>
                  <span className="w-28 shrink-0 text-sm">{intentLabels[item.intent as PatientIntent] || item.intent}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(item.count / intentMax) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm font-semibold tabular-nums">{item.count}</span>
                </div>
              )) : <p className="text-sm text-muted-foreground">Данные появятся после первых обращений.</p>}
            </div>
          </section>
          <section className="rounded-[16px] border border-border bg-white/70 p-5 sm:p-6">
            <h2 className="font-semibold">Языки обращений</h2>
            <p className="mt-1 text-xs text-muted-foreground">Доля диалогов по языку за месяц</p>
            <div className="mt-5 space-y-3">
              {demand.languages.length ? demand.languages.map((item) => (
                <div key={item.language}>
                  <div className="flex justify-between text-sm">
                    <span>{languageLabels[item.language] || item.language}</span>
                    <span className="font-semibold">{Math.round((item.count / languageTotal) * 100)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[#78ad95]" style={{ width: `${(item.count / languageTotal) * 100}%` }} />
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">Данные появятся после первых диалогов.</p>}
            </div>
          </section>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ icon: Icon, label, value }) => (
          <article
            className="rounded-[15px] border border-border bg-white/70 p-5"
            key={label}
          >
            <Icon className="size-6 text-primary" />
            <p className="mt-8 text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 font-editorial text-5xl text-[#193229]">
              {String(value)}
            </p>
          </article>
        ))}
      </div>
      <section className="mt-5 rounded-[16px] border border-border bg-white/70 p-5 sm:p-7">
        <div className="mb-8">
          <h2 className="text-lg font-semibold">Записи за 7 дней</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Количество запланированных приёмов по дням
          </p>
        </div>
        <div className="flex h-64 items-end gap-3 sm:gap-6">
          {daily.map((item) => (
            <div
              className="flex h-full flex-1 flex-col justify-end gap-2"
              key={String(item.label)}
            >
              <div className="relative flex flex-1 items-end">
                <div
                  className="w-full rounded-t-[8px] bg-[#78ad95] transition hover:bg-primary"
                  style={{
                    height: `${Math.max((Number(item.appointments) / max) * 100, 4)}%`,
                  }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-semibold">
                    {String(item.appointments)}
                  </span>
                </div>
              </div>
              <span className="text-center text-xs text-muted-foreground">
                {String(item.label)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
