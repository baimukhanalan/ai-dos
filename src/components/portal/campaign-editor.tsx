"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarBlank,
  CheckCircle,
  Eye,
  FloppyDisk,
  Megaphone,
  SpinnerGap,
  StopCircle,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  campaignSafetyChecks,
  type AudienceSummary,
} from "@/lib/campaigns/policy";

type CampaignState = {
  id: string; name: string; purpose: string; campaignType: string; channel: string; locale: string;
  status: string; audienceFilter: Record<string, unknown>; subject: string; messageBody: string;
  timezone: string; sendWindowStart: string; sendWindowEnd: string; dailyLimit: number;
  periodDays: number; maxContacts: number; frequencyCapDays: number; revision: number;
  scheduledAt: string | null; results: Record<string, number>;
};

type Option = { id: string; name: string };

const typeOptions = [
  ["recall", "Повторный приём", "Вернуть пациента на плановый визит"],
  ["prevention", "Профилактика", "Скрининг и профилактический осмотр"],
  ["vaccination", "Вакцинация", "Приглашение на вакцинацию"],
  ["checkup", "Check-up", "Ежегодный комплексный осмотр"],
] as const;

const statusLabels: Record<string, string> = {
  draft: "Черновик", scheduled: "Запланирована", running: "Выполняется",
  paused: "Приостановлена", completed: "Завершена", cancelled: "Остановлена",
};

export function CampaignEditor({ campaign: initial, initialAudience, initialProviderReady, specialties, branches }: {
  campaign: CampaignState; initialAudience: AudienceSummary; initialProviderReady: boolean;
  specialties: Option[]; branches: Option[];
}) {
  const [campaign, setCampaign] = useState(initial);
  const [audience, setAudience] = useState(initialAudience);
  const [providerReady, setProviderReady] = useState(initialProviderReady);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "preview" | "schedule" | "stop" | "">("");
  const [message, setMessage] = useState("");
  const [startsAt, setStartsAt] = useState(() => {
    const date = initial.scheduledAt ? new Date(initial.scheduledAt) : new Date(Date.now() + 86400000);
    date.setMinutes(0, 0, 0);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const editable = campaign.status === "draft";
  const filter = campaign.audienceFilter;
  const checks = useMemo(() => campaignSafetyChecks({
    audience, providerReady, messageBody: campaign.messageBody,
    sendWindowStart: campaign.sendWindowStart, sendWindowEnd: campaign.sendWindowEnd,
  }), [audience, providerReady, campaign.messageBody, campaign.sendWindowStart, campaign.sendWindowEnd]);

  function patch(values: Partial<CampaignState>) {
    setCampaign((current) => ({ ...current, ...values }));
    setDirty(true);
    setMessage("");
  }

  function patchFilter(key: string, value: string) {
    patch({ audienceFilter: { ...filter, [key]: value || undefined } });
  }

  function payload(includeRevision = false) {
    const numeric = (value: unknown) => value === undefined || value === "" ? undefined : Number(value);
    return {
      name: campaign.name, purpose: campaign.purpose, campaignType: campaign.campaignType,
      channel: campaign.channel, locale: campaign.locale,
      audienceFilter: {
        lastVisitMonthsMin: numeric(filter.lastVisitMonthsMin),
        lastVisitMonthsMax: numeric(filter.lastVisitMonthsMax),
        specialtyId: filter.specialtyId || undefined, branchId: filter.branchId || undefined,
        language: filter.language || undefined,
      },
      subject: campaign.subject || undefined, messageBody: campaign.messageBody,
      timezone: campaign.timezone, sendWindowStart: campaign.sendWindowStart,
      sendWindowEnd: campaign.sendWindowEnd, dailyLimit: campaign.dailyLimit,
      periodDays: campaign.periodDays, maxContacts: campaign.maxContacts,
      frequencyCapDays: campaign.frequencyCapDays,
      ...(includeRevision ? { expectedRevision: campaign.revision } : {}),
    };
  }

  async function request(path: string, body: unknown, method = "POST") {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { data?: Record<string, unknown>; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message || "Операция не выполнена.");
    return result.data || {};
  }

  async function preview() {
    setBusy("preview"); setMessage("");
    try {
      const data = await request(`/api/automations/campaigns/${campaign.id}/preview`, payload());
      setAudience(data.audience as AudienceSummary);
      setProviderReady(Boolean(data.providerReady));
      setMessage("Аудитория пересчитана по живым данным и последним согласиям.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось пересчитать аудиторию."); }
    finally { setBusy(""); }
  }

  async function save() {
    setBusy("save"); setMessage("");
    try {
      const data = await request(`/api/automations/campaigns/${campaign.id}`, payload(true), "PATCH");
      setCampaign((current) => ({ ...current, revision: Number(data.revision) }));
      setDirty(false); setMessage("Черновик сохранён. Перед запуском пересчитайте аудиторию.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось сохранить кампанию."); }
    finally { setBusy(""); }
  }

  async function schedule() {
    if (dirty) { setMessage("Сначала сохраните изменения."); return; }
    if (!window.confirm(`Запланировать кампанию для ${audience.eligible} подходящих контактов? Отправка начнётся только в разрешённое время.`)) return;
    setBusy("schedule");
    try {
      await request(`/api/automations/campaigns/${campaign.id}/schedule`, {
        expectedRevision: campaign.revision, startsAt: new Date(startsAt).toISOString(), confirmed: true,
      });
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось запланировать кампанию."); setBusy(""); }
  }

  async function stop() {
    if (!window.confirm("Остановить кампанию? Все ещё не отправленные сообщения будут отменены.")) return;
    setBusy("stop");
    try { await request(`/api/automations/campaigns/${campaign.id}/stop`, { confirmed: true }); window.location.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось остановить кампанию."); setBusy(""); }
  }

  return (
    <div className="-mx-4 -my-7 min-h-[calc(100vh-76px)] bg-[#fbfaf6] sm:-mx-7 lg:-mx-9 lg:-my-9">
      <header className="flex flex-col gap-4 border-b border-border px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Link className="text-xs font-semibold text-primary hover:underline" href="/portal/automations">← Автоматизация</Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input aria-label="Название кампании" className="min-w-0 flex-1 bg-transparent font-editorial text-[clamp(2rem,3vw,3rem)] leading-none text-[#17241f] outline-none xl:min-w-[520px]" disabled={!editable} onChange={(event) => patch({ name: event.target.value })} value={campaign.name} />
            <span className="rounded-full border border-[#e7c98d] bg-[#fff8e8] px-3 py-1 text-xs font-semibold text-[#9b5b00]">{statusLabels[campaign.status] || campaign.status}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Consent-aware аудитория · revision {campaign.revision}{campaign.scheduledAt ? ` · старт ${new Date(campaign.scheduledAt).toLocaleString("ru-KZ")}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-primary bg-white px-4 text-sm font-semibold text-primary disabled:opacity-50" disabled={Boolean(busy)} onClick={preview} type="button"><Eye className="size-4" />Предпросмотр</button>
          <button className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={!editable || Boolean(busy)} onClick={schedule} type="button">{busy === "schedule" ? <SpinnerGap className="size-4 animate-spin" /> : <CalendarBlank className="size-4" />}Запланировать</button>
        </div>
      </header>

      <div className="grid border-b border-border bg-white px-5 py-4 sm:grid-cols-2 xl:grid-cols-4">
        {["Аудитория", "Сообщение", "Расписание", "Проверка"].map((label, index) => <div className="flex items-center gap-3 py-2" key={label}><span className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold ${index === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{index + 1}</span><span className="text-sm font-semibold">{label}</span></div>)}
      </div>
      {message && <div className="border-b border-border bg-[#f4f8f5] px-5 py-3 text-sm text-[#294b3e]" role="status">{message}</div>}

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <section className="rounded-[14px] border border-border bg-white p-5">
            <h2 className="font-editorial text-2xl">Тип кампании</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {typeOptions.map(([value, label, detail]) => <button className={`rounded-[11px] border p-4 text-left ${campaign.campaignType === value ? "border-primary bg-[#f3f8f4] ring-1 ring-primary" : "border-border"}`} disabled={!editable} key={value} onClick={() => patch({ campaignType: value })} type="button"><Megaphone className="size-5 text-primary" /><span className="mt-3 block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></button>)}
            </div>
          </section>

          <section className="rounded-[14px] border border-border bg-white p-5">
            <h2 className="font-editorial text-2xl">Аудитория и сообщение</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Последний визит, от (мес.)"><input className="control" disabled={!editable} min={0} onChange={(e) => patchFilter("lastVisitMonthsMin", e.target.value)} type="number" value={String(filter.lastVisitMonthsMin ?? "")} /></Field>
              <Field label="До (мес.)"><input className="control" disabled={!editable} min={1} onChange={(e) => patchFilter("lastVisitMonthsMax", e.target.value)} type="number" value={String(filter.lastVisitMonthsMax ?? "")} /></Field>
              <Field label="Специальность"><select className="control" disabled={!editable} onChange={(e) => patchFilter("specialtyId", e.target.value)} value={String(filter.specialtyId || "")}><option value="">Все</option>{specialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Филиал"><select className="control" disabled={!editable} onChange={(e) => patchFilter("branchId", e.target.value)} value={String(filter.branchId || "")}><option value="">Все</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Канал"><select className="control" disabled={!editable} onChange={(e) => patch({ channel: e.target.value })} value={campaign.channel}><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="telegram">Telegram</option><option value="voice">Голос</option></select></Field>
              <Field label="Язык"><select className="control" disabled={!editable} onChange={(e) => patch({ locale: e.target.value, audienceFilter: { ...filter, language: e.target.value } })} value={campaign.locale}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select></Field>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Цель"><input className="control" disabled={!editable} maxLength={240} onChange={(e) => patch({ purpose: e.target.value })} value={campaign.purpose} /></Field>
              <Field label="Тема"><input className="control" disabled={!editable} maxLength={160} onChange={(e) => patch({ subject: e.target.value })} value={campaign.subject} /></Field>
            </div>
            <Field label="Сообщение"><textarea className="mt-2 min-h-36 w-full rounded-[9px] border border-input bg-white p-3 text-sm" disabled={!editable} maxLength={4000} onChange={(e) => patch({ messageBody: e.target.value })} value={campaign.messageBody} /></Field>
            <p className="mt-2 text-xs text-muted-foreground">Доступны: {"{{patientName}}"}, {"{{clinic}}"}, {"{{supportPhone}}"}, {"{{optOutUrl}}"}. Ссылка отказа обязательна; медицинские подробности и диагнозы не добавляйте.</p>
          </section>

          <section className="rounded-[14px] border border-border bg-white p-5">
            <h2 className="font-editorial text-2xl">Расписание</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Начало"><input className="control" disabled={!editable} onChange={(e) => setStartsAt(e.target.value)} type="datetime-local" value={startsAt} /></Field>
              <Field label="Часовой пояс"><input className="control" disabled={!editable} onChange={(e) => patch({ timezone: e.target.value })} value={campaign.timezone} /></Field>
              <Field label="Разрешённые часы"><div className="grid grid-cols-2 gap-2"><input className="control" disabled={!editable} onChange={(e) => patch({ sendWindowStart: e.target.value })} type="time" value={campaign.sendWindowStart} /><input className="control" disabled={!editable} onChange={(e) => patch({ sendWindowEnd: e.target.value })} type="time" value={campaign.sendWindowEnd} /></div></Field>
              <Field label="Лимит в день"><input className="control" disabled={!editable} min={1} onChange={(e) => patch({ dailyLimit: Number(e.target.value) })} type="number" value={campaign.dailyLimit} /></Field>
              <Field label="Период, дней"><input className="control" disabled={!editable} min={1} onChange={(e) => patch({ periodDays: Number(e.target.value) })} type="number" value={campaign.periodDays} /></Field>
              <Field label="Частотный лимит, дней"><input className="control" disabled={!editable} min={1} onChange={(e) => patch({ frequencyCapDays: Number(e.target.value) })} type="number" value={campaign.frequencyCapDays} /></Field>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3"><button className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50" disabled={!editable || !dirty || Boolean(busy)} onClick={save} type="button">{busy === "save" ? <SpinnerGap className="size-4 animate-spin" /> : <FloppyDisk className="size-4" />}Сохранить черновик</button><span className={`text-xs ${dirty ? "text-[#9b5b00]" : "text-primary"}`}>{dirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span></div>
          </section>
        </main>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-[14px] border border-border bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="font-editorial text-xl">Аудитория</h2><UsersThree className="size-5 text-primary" /></div>
            <Metric label="Всего по фильтрам" value={audience.total} />
            <Metric label="Нет согласия" tone="warn" value={audience.noConsent} />
            <Metric label="Opt-out" tone="danger" value={audience.optedOut} />
            <Metric label="Частотный лимит" tone="warn" value={audience.frequencyCapped} />
            <Metric label="Нет контакта канала" tone="warn" value={audience.missingChannel} />
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-[#b9d9c8] bg-[#f2faf6] p-4"><span className="text-sm font-semibold">Готово к отправке</span><strong className="font-editorial text-3xl text-primary">{audience.eligible}</strong></div>
          </section>
          <section className="rounded-[14px] border border-border bg-white p-5">
            <h2 className="font-editorial text-xl">Проверки безопасности</h2>
            <div className="mt-4 space-y-3">{checks.map((check) => <div className="flex items-center gap-2 text-xs" key={check.code}>{check.valid ? <CheckCircle className="size-4 shrink-0 text-[#16834d]" weight="fill" /> : <WarningCircle className="size-4 shrink-0 text-[#c75b12]" weight="fill" />}<span>{check.label}</span></div>)}</div>
            {!providerReady && <p className="mt-4 rounded-[8px] bg-[#fff8e8] p-3 text-xs leading-5 text-[#8b5809]">Канал можно настроить и проверить, но запуск станет доступен только после официальных credentials провайдера.</p>}
            <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-destructive text-sm font-semibold text-destructive disabled:opacity-40" disabled={!['scheduled','running','paused'].includes(campaign.status) || Boolean(busy)} onClick={stop} type="button"><StopCircle className="size-5" />Остановить кампанию</button>
          </section>
          {campaign.status !== "draft" && <section className="rounded-[14px] border border-border bg-white p-5"><h2 className="font-editorial text-xl">Результаты</h2><Metric label="Контактов" value={Number(campaign.results.total || 0)} /><Metric label="Отправлено" value={Number(campaign.results.sent || 0)} /><Metric label="В очереди" value={Number(campaign.results.queued || 0)} /><Metric label="Отказались" tone="warn" value={Number(campaign.results.optedOut || 0)} /><Metric label="Ошибки / blocked" tone="danger" value={Number(campaign.results.failed || 0) + Number(campaign.results.blocked || 0)} /></section>}
        </aside>
      </div>
      <style jsx>{`.control{height:2.5rem;width:100%;border-radius:9px;border:1px solid var(--input);background:white;padding:0 .75rem;font-size:.875rem}.control:disabled{background:var(--muted);opacity:.8}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block text-sm font-semibold first:mt-0">{label}<div className="mt-2">{children}</div></label>;
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-[#b86a00]" : "text-[#17241f]";
  return <div className="mt-3 flex items-center justify-between border-b border-border pb-3 text-sm"><span className="text-muted-foreground">{label}</span><strong className={color}>{value}</strong></div>;
}
