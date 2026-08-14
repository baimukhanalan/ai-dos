"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarBlank, ChatCircle, CheckCircle, ClockCounterClockwise, EnvelopeSimple, Funnel, MagnifyingGlass, Megaphone, Phone, ShieldCheck, SpinnerGap, UserCircleCheck, UsersThree } from "@phosphor-icons/react";
import type { PatientTimelineEvent } from "@/lib/patient-360";

const purposeLabels: Record<string, string> = {
  data_processing: "Обработка данных",
  call_recording: "Запись разговора",
  messages: "Сообщения (SMS, Email)",
  whatsapp: "WhatsApp",
  outbound_calls: "Исходящие звонки",
  marketing_campaign: "Маркетинговые кампании",
};
const typeLabels: Record<string, string> = { call: "Звонки", conversation: "Разговоры", appointment: "Записи", notification: "Уведомления", callback: "Обратный звонок", waitlist: "Лист ожидания", campaign: "Кампании", task: "Задачи", consent: "Согласия" };

export function Patient360Workspace({ patientId, events, consents }: { patientId: string; events: PatientTimelineEvent[]; consents: Array<Record<string, unknown>> }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [channel, setChannel] = useState("all");
  const [visible, setVisible] = useState(25);
  const [pendingPurpose, setPendingPurpose] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const latest = new Map(consents.map((item) => [String(item.purpose), item]));
  const filtered = useMemo(() => events.filter((item) => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return (type === "all" || item.type === type) && (channel === "all" || item.channel === channel) && (!needle || `${item.title} ${item.detail || ""} ${item.actor} ${item.status}`.toLocaleLowerCase("ru").includes(needle));
  }), [events, query, type, channel]);
  const channels = [...new Set(events.map((item) => item.channel))].sort();

  async function updateConsent(purpose: string, status: "granted" | "withdrawn") {
    const action = status === "granted" ? "зафиксировать согласие" : "отозвать согласие";
    if (!window.confirm(`Подтвердите: ${action} «${purposeLabels[purpose]}»? Изменение попадёт в аудит.`)) return;
    setPendingPurpose(purpose);
    setMessage("");
    const response = await fetch(`/api/patients/${patientId}/consents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose, status, source: "reception", textVersion: "v1" }) });
    const payload = await response.json();
    setPendingPurpose(null);
    if (!response.ok) { setMessage(payload.error?.message || "Не удалось изменить согласие."); return; }
    setMessage(status === "granted" ? "Согласие зафиксировано." : "Отзыв согласия зафиксирован.");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-heading text-2xl">История взаимодействий</h2><span className="text-xs text-muted-foreground">{filtered.length} событий</span></div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="relative"><MagnifyingGlass className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><input aria-label="Поиск по истории" className="h-11 w-full rounded-[9px] border border-input bg-white pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по истории" value={query} /></label>
          <label className="relative"><Funnel className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><select aria-label="Тип события" className="h-11 w-full appearance-none rounded-[9px] border border-input bg-white pl-9 pr-3 text-sm" onChange={(event) => setType(event.target.value)} value={type}><option value="all">Все события</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <select aria-label="Канал" className="h-11 rounded-[9px] border border-input bg-white px-3 text-sm" onChange={(event) => setChannel(event.target.value)} value={channel}><option value="all">Все каналы</option>{channels.map((value) => <option key={value} value={value}>{channelLabel(value)}</option>)}</select>
        </div>
        <div className="mt-5 overflow-hidden rounded-[14px] border border-border bg-white/75">
          {filtered.slice(0, visible).map((item) => <TimelineRow event={item} key={item.id} />)}
          {!filtered.length && <p className="p-10 text-center text-sm text-muted-foreground">По выбранным фильтрам событий нет.</p>}
          {visible < filtered.length && <button className="flex h-12 w-full items-center justify-center gap-2 border-t border-border text-sm font-semibold text-primary hover:bg-secondary" onClick={() => setVisible((value) => value + 25)} type="button"><ClockCounterClockwise className="size-4" /> Загрузить ещё</button>}
        </div>
      </section>
      <aside className="min-w-0 xl:sticky xl:top-8 xl:self-start">
        <h2 className="font-heading text-2xl">Согласия</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Каждый вид согласия хранится отдельно. Согласие на обслуживание не включает маркетинг.</p>
        {message && <p className="mt-3 rounded-[9px] bg-secondary px-3 py-2 text-sm text-primary" role="status">{message}</p>}
        <div className="mt-4 overflow-hidden rounded-[14px] border border-border bg-white/80">
          {Object.keys(purposeLabels).map((purpose) => {
            const consent = latest.get(purpose);
            const granted = consent?.status === "granted";
            return <div className="border-b border-border p-4 last:border-0" key={purpose}><div className="flex gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${granted ? "bg-secondary text-primary" : "bg-muted text-muted-foreground"}`}><ShieldCheck className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{purposeLabels[purpose]}</p><span className={`rounded px-2 py-1 text-[11px] font-semibold ${granted ? "bg-[#e3f1e8] text-[#17603d]" : "bg-[#f1efeb] text-[#6c665f]"}`}>{granted ? "Предоставлено" : consent ? "Отозвано" : "Не зафиксировано"}</span></div>{consent && <p className="mt-1 text-xs leading-5 text-muted-foreground">{sourceLabel(String(consent.source))} · {formatDate(consent.recorded_at)} · версия {String(consent.text_version)}</p>}<button className="mt-2 text-xs font-semibold text-primary hover:underline disabled:opacity-50" disabled={pendingPurpose === purpose} onClick={() => updateConsent(purpose, granted ? "withdrawn" : "granted")} type="button">{pendingPurpose === purpose ? <SpinnerGap className="inline size-4 animate-spin" /> : granted ? "Отозвать" : "Зафиксировать согласие"}</button></div></div></div>;
          })}
        </div>
      </aside>
    </div>
  );
}

function TimelineRow({ event }: { event: PatientTimelineEvent }) {
  const Icon = ({ call: Phone, conversation: ChatCircle, appointment: CalendarBlank, notification: EnvelopeSimple, callback: Phone, waitlist: UsersThree, campaign: Megaphone, task: UserCircleCheck, consent: CheckCircle } as const)[event.type];
  return <article className="grid gap-3 border-b border-border/80 p-4 last:border-0 sm:grid-cols-[70px_36px_minmax(0,1fr)_auto] sm:items-start"><time className="text-xs text-muted-foreground">{formatTime(event.timestamp)}<span className="mt-1 block sm:hidden">{formatDay(event.timestamp)}</span></time><span className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary"><Icon className="size-5" /></span><div className="min-w-0"><p className="text-sm font-semibold">{event.title}</p>{event.detail && <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{event.detail}</p>}<p className="mt-1 text-[11px] text-muted-foreground">{event.actor}{event.branch ? ` · ${event.branch}` : ""} · {channelLabel(event.channel)}</p></div><span className="w-fit rounded bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">{statusLabel(event.status)}</span></article>;
}

function formatTime(value: unknown) { return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(new Date(String(value))); }
function formatDay(value: unknown) { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" }).format(new Date(String(value))); }
function formatDate(value: unknown) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Almaty" }).format(new Date(String(value))); }
function channelLabel(value: string) { return ({ phone: "Телефон", whatsapp: "WhatsApp", telegram: "Telegram", sms: "SMS", email: "Email", web: "Веб-чат", portal: "Портал", mcp: "MCP", damumed: "DamuMed", reception: "На приёме", website: "Сайт", document: "Документ", patient_portal: "Портал пациента" } as Record<string, string>)[value] || value; }
function sourceLabel(value: string) { return ({ reception: "На приёме", phone: "По телефону", website: "На сайте", whatsapp: "WhatsApp", document: "Документ", patient_portal: "Портал пациента" } as Record<string, string>)[value] || value; }
function statusLabel(value: string) { return ({ completed: "Завершено", confirmed: "Подтверждено", cancelled: "Отменено", sent: "Отправлено", delivered: "Доставлено", failed: "Ошибка", open: "Открыто", in_progress: "В работе", done: "Выполнено", granted: "Предоставлено", withdrawn: "Отозвано", waiting: "Ожидает", queued: "В очереди", closed: "Закрыто", active: "Активно", missed: "Пропущено" } as Record<string, string>)[value] || value; }
