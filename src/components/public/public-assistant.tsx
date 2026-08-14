"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  Clock,
  FirstAid,
  PaperPlaneTilt,
  Phone,
  ShieldCheck,
  Stethoscope,
} from "@phosphor-icons/react";
import { Brand } from "@/components/brand";

type Locale = "ru" | "kk" | "en";
type ChatMessage = { id: string; role: "assistant" | "patient"; text: string };
type ApiData = {
  reply: string;
  verified: boolean;
  requiresIdentity: boolean;
  canRegister?: boolean;
  outcome: string | null;
  appointmentId?: string | null;
};
type IdentityPayload = { phone: string; surname?: string; birthDate?: string };
type RegistrationPayload = {
  fullName: string;
  phone: string;
  birthDate: string;
  consent: true;
};

const copy = {
  ru: {
    title: "Запишитесь без ожидания на линии",
    lead: "Спросите о врачах, графике и свободном времени — AI Dos ответит по данным клиники.",
    greeting: "Здравствуйте! Я AI Dos, администратор клиники. Чем помочь?",
    actions: ["Найти врача", "Узнать график", "Свободное время", "Обратный звонок"],
    prompts: [
      "Какие врачи работают в клинике?",
      "Назовите точный график врачей по дням и часам.",
      "Покажите свободное время для записи.",
      "Мне нужен обратный звонок сотрудника.",
    ],
    placeholder: "Напишите, что вам нужно…",
    send: "Отправить",
    identity: "Подтверждение личности",
    identityHint: "Для записи нужен телефон и фамилия или дата рождения.",
    phone: "Номер телефона",
    surname: "Фамилия",
    birthDate: "Дата рождения",
    verify: "Подтвердить и продолжить",
    newPatient: "Я новый пациент",
    existingPatient: "У меня уже есть карта",
    registration: "Новый пациент",
    registrationHint: "Создадим минимальную карту для записи. Медицинские данные здесь не запрашиваются.",
    fullName: "Фамилия, имя и отчество",
    consent: "Я согласен(на) на обработку данных для создания карты и записи на приём.",
    register: "Создать карту и продолжить",
    verified: "Личность подтверждена",
    safety: "AI Dos не ставит диагнозы. В экстренной ситуации звоните 103 или 112.",
    back: "На главную",
    secure: "Безопасно и конфиденциально",
  },
  kk: {
    title: "Желіде күтпей-ақ жазылыңыз",
    lead: "Дәрігерлер, кесте және бос уақыт туралы сұраңыз — AI Dos клиника деректерімен жауап береді.",
    greeting: "Сәлеметсіз бе! Мен AI Dos, клиника әкімшісімін. Қалай көмектесейін?",
    actions: ["Дәрігер табу", "Кестені білу", "Бос уақыт", "Кері қоңырау"],
    prompts: ["Клиникада қандай дәрігерлер жұмыс істейді?", "Дәрігерлердің нақты жұмыс кестесін айтыңыз.", "Жазылуға бос уақытты көрсетіңіз.", "Маған қызметкердің кері қоңырауы керек."],
    placeholder: "Не қажет екенін жазыңыз…",
    send: "Жіберу",
    identity: "Жеке басты растау",
    identityHint: "Жазылу үшін телефон және тегіңіз немесе туған күніңіз қажет.",
    phone: "Телефон нөмірі",
    surname: "Тегі",
    birthDate: "Туған күні",
    verify: "Растау және жалғастыру",
    newPatient: "Мен жаңа пациентпін",
    existingPatient: "Менің картам бар",
    registration: "Жаңа пациент",
    registrationHint: "Жазылу үшін ең аз деректермен карта жасаймыз. Мұнда медициналық деректер сұралмайды.",
    fullName: "Тегі, аты және әкесінің аты",
    consent: "Карта жасау және қабылдауға жазылу үшін деректерімді өңдеуге келісемін.",
    register: "Карта жасау және жалғастыру",
    verified: "Жеке бас расталды",
    safety: "AI Dos диагноз қоймайды. Шұғыл жағдайда 103 немесе 112 нөміріне қоңырау шалыңыз.",
    back: "Басты бетке",
    secure: "Қауіпсіз және құпия",
  },
  en: {
    title: "Book without waiting on the phone",
    lead: "Ask about doctors, schedules and availability — AI Dos answers from clinic data.",
    greeting: "Hello! I’m AI Dos, the clinic’s assistant. How can I help?",
    actions: ["Find a doctor", "Doctor schedules", "Available times", "Request callback"],
    prompts: ["Which doctors work at the clinic?", "Give me the exact doctor schedules by day and time.", "Show available appointment times.", "I need a callback from clinic staff."],
    placeholder: "Tell us what you need…",
    send: "Send",
    identity: "Identity verification",
    identityHint: "Booking requires your phone and either surname or date of birth.",
    phone: "Phone number",
    surname: "Surname",
    birthDate: "Date of birth",
    verify: "Verify and continue",
    newPatient: "I’m a new patient",
    existingPatient: "I already have a record",
    registration: "New patient",
    registrationHint: "We’ll create a minimal record for booking. No medical details are requested here.",
    fullName: "Full name",
    consent: "I consent to processing my data to create a patient record and book an appointment.",
    register: "Create record and continue",
    verified: "Identity verified",
    safety: "AI Dos does not diagnose. In an emergency call 103 or 112.",
    back: "Home",
    secure: "Secure and confidential",
  },
} satisfies Record<Locale, Record<string, string | string[]>>;

export function PublicAssistant({ clinicName }: { clinicName: string }) {
  const [locale, setLocale] = useState<Locale>("ru");
  const t = copy[locale];
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", text: t.greeting as string },
  ]);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState("");
  const [requiresIdentity, setRequiresIdentity] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [formMode, setFormMode] = useState<"identity" | "registration">("identity");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [surname, setSurname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, requiresIdentity]);

  async function sendMessage(
    message: string,
    credentials?: { identity?: IdentityPayload; registration?: RegistrationPayload },
  ) {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    if (!credentials) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "patient", text }]);
    }
    try {
      const response = await fetch("/api/public/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale, ...credentials }),
      });
      const payload = (await response.json()) as { ok: boolean; data?: ApiData; error?: { message?: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Не удалось отправить сообщение.");
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", text: payload.data!.reply }]);
      setVerified(payload.data.verified);
      setRequiresIdentity(payload.data.requiresIdentity);
      setCanRegister(Boolean(payload.data.canRegister));
      if (payload.data.requiresIdentity) {
        setPendingMessage(text);
        if (payload.data.canRegister === false) setFormMode("identity");
      } else {
        setPendingMessage("");
        setFormMode("identity");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить сообщение.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = input;
    setInput("");
    void sendMessage(message);
  }

  function submitIdentity(event: FormEvent) {
    event.preventDefault();
    void sendMessage(pendingMessage, {
      identity: {
        phone,
        surname: surname || undefined,
        birthDate: birthDate || undefined,
      },
    });
  }

  function submitRegistration(event: FormEvent) {
    event.preventDefault();
    if (!consent) return;
    void sendMessage(pendingMessage, {
      registration: {
        fullName,
        phone,
        birthDate,
        consent: true,
      },
    });
  }

  function switchLocale(next: Locale) {
    setLocale(next);
    setMessages([{ id: `greeting-${next}`, role: "assistant", text: copy[next].greeting as string }]);
    setRequiresIdentity(false);
    setCanRegister(false);
    setFormMode("identity");
    setPendingMessage("");
  }

  const icons = [Stethoscope, CalendarBlank, Clock, Phone];
  return (
    <main className="story min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--paper)_92%,white)]">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-5">
            <Brand className="shrink-0 whitespace-nowrap font-display text-[25px]" />
            <span className="hidden h-8 w-px bg-[var(--rule-strong)] sm:block" />
            <span className="hidden font-display text-xl sm:block">Клиника {clinicName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div aria-label="Язык" className="flex rounded-full border border-[var(--rule-strong)] p-1">
              {(["ru", "kk", "en"] as const).map((item) => (
                <button className={`rounded-full px-2.5 py-1 text-xs font-semibold ${locale === item ? "bg-[var(--primary)] text-white" : "text-[var(--ink-3)]"}`} key={item} onClick={() => switchLocale(item)} type="button">{item === "kk" ? "KZ" : item.toUpperCase()}</button>
              ))}
            </div>
            <Link className="hidden items-center gap-2 text-sm font-semibold text-[var(--primary)] sm:flex" href="/"><ArrowLeft className="size-4" /> {t.back}</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-76px)] max-w-[1440px] gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(300px,430px)_minmax(0,1fr)] lg:items-center lg:px-12 lg:py-10">
        <section className="order-2 py-4 lg:order-1 lg:py-10">
          <h1 className="font-display text-[clamp(2.65rem,5vw,5.25rem)] leading-[.98]">{t.title}</h1>
          <p className="mt-6 max-w-[44ch] text-base leading-7 text-[var(--ink-3)] sm:text-lg sm:leading-8">{t.lead}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {(t.actions as string[]).map((label, index) => {
              const Icon = icons[index];
              return <button className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--rule-strong)] bg-white/55 px-4 text-left text-sm font-semibold text-[var(--primary)] transition hover:-translate-y-0.5 hover:bg-white" key={label} onClick={() => void sendMessage((t.prompts as string[])[index])} type="button"><Icon className="size-5" />{label}</button>;
            })}
          </div>
          <div className="mt-7 flex gap-3 rounded-xl border border-[#c5ddda] bg-[#eaf6f4] p-4 text-sm leading-6 text-[#28584f]"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">{t.secure}</p><p>{t.safety}</p></div></div>
        </section>

        <section aria-label="Чат с AI Dos" className="order-1 flex min-h-[640px] flex-col overflow-hidden rounded-[22px] border border-[var(--rule-strong)] bg-white/80 shadow-[0_24px_70px_rgba(22,50,41,.12)] lg:order-2 lg:h-[min(760px,calc(100vh-112px))]">
          <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-[var(--primary)] text-white"><FirstAid className="size-5" weight="fill" /></span><div><p className="font-semibold">AI Dos</p><p className="text-xs text-[var(--ink-3)]">Клиника {clinicName}</p></div></div>
            {verified ? <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]"><CheckCircle className="size-4" weight="fill" /> {t.verified}</span> : null}
          </div>
          <div aria-live="polite" className="hide-scrollbar flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.map((message) => <div className={`flex ${message.role === "patient" ? "justify-end" : "justify-start"}`} key={message.id}><div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "patient" ? "rounded-br-md bg-[var(--primary)] text-white" : "rounded-bl-md bg-[#edf4f1] text-[var(--ink)]"}`}>{message.text}</div></div>)}
            {busy ? <div className="w-fit rounded-2xl rounded-bl-md bg-[#edf4f1] px-4 py-3 text-sm text-[var(--ink-3)]">AI Dos отвечает…</div> : null}
            {requiresIdentity && formMode === "identity" ? <form className="rounded-2xl border border-[#c5ddda] bg-[#f2faf7] p-4" onSubmit={submitIdentity}><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-[var(--primary)]" /><div><p className="font-semibold">{t.identity}</p><p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">{t.identityHint}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">{t.phone}<input autoComplete="tel" className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="+7 700 000 00 00" required value={phone} /></label><label className="text-xs font-semibold">{t.surname}<input autoComplete="family-name" className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" onChange={(event) => setSurname(event.target.value)} value={surname} /></label><label className="text-xs font-semibold sm:col-span-2">{t.birthDate}<input autoComplete="bday" className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" onChange={(event) => setBirthDate(event.target.value)} type="date" value={birthDate} /></label></div><button className="mt-4 h-11 w-full rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !phone || (!surname && !birthDate)} type="submit">{t.verify}</button>{canRegister ? <button className="mt-2 h-10 w-full text-sm font-semibold text-[var(--primary)]" onClick={() => setFormMode("registration")} type="button">{t.newPatient}</button> : null}</form> : null}
            {requiresIdentity && formMode === "registration" ? <form className="rounded-2xl border border-[#c5ddda] bg-[#f2faf7] p-4" onSubmit={submitRegistration}><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-[var(--primary)]" /><div><p className="font-semibold">{t.registration}</p><p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">{t.registrationHint}</p></div></div><div className="mt-4 grid gap-3"><label className="text-xs font-semibold">{t.fullName}<input autoComplete="name" className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" onChange={(event) => setFullName(event.target.value)} required value={fullName} /></label><label className="text-xs font-semibold">{t.phone}<input autoComplete="tel" className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="+7 700 000 00 00" required value={phone} /></label><label className="text-xs font-semibold">{t.birthDate}<input autoComplete="bday" className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" onChange={(event) => setBirthDate(event.target.value)} required type="date" value={birthDate} /></label><label className="flex items-start gap-2 text-xs leading-5 text-[var(--ink-3)]"><input checked={consent} className="mt-1 size-4 accent-[var(--primary)]" onChange={(event) => setConsent(event.target.checked)} required type="checkbox" />{t.consent}</label></div><button className="mt-4 h-11 w-full rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !fullName.trim() || !phone || !birthDate || !consent} type="submit">{t.register}</button><button className="mt-2 h-10 w-full text-sm font-semibold text-[var(--primary)]" onClick={() => setFormMode("identity")} type="button">{t.existingPatient}</button></form> : null}
            <div ref={endRef} />
          </div>
          <form className="border-t border-[var(--rule)] bg-white/90 p-3 sm:p-4" onSubmit={submit}><div className="flex gap-2"><label className="sr-only" htmlFor="patient-message">{t.placeholder}</label><input className="h-12 min-w-0 flex-1 rounded-xl border border-[var(--rule-strong)] bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/25" disabled={busy || requiresIdentity} id="patient-message" onChange={(event) => setInput(event.target.value)} placeholder={t.placeholder as string} value={input} /><button aria-label={t.send as string} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || requiresIdentity || !input.trim()} type="submit"><PaperPlaneTilt className="size-4" /><span className="hidden sm:inline">{t.send}</span></button></div>{error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}</form>
        </section>
      </div>
    </main>
  );
}
