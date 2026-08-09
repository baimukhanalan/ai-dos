"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowBendUpLeft,
  CalendarBlank,
  Check,
  Clock,
  DotsThree,
  FolderOpen,
  Info,
  Phone,
  Sparkle,
  Stethoscope,
  User,
} from "@phosphor-icons/react";
import { AssistantComposer } from "@/components/ai/assistant-composer";
import { formatPhone } from "@/lib/utils";

type Row = Record<string, unknown>;

export function ConversationWorkspace({
  conversations,
  messages,
  appointments,
  doctors,
  timezone,
}: {
  conversations: Row[];
  messages: Row[];
  appointments: Row[];
  doctors: Row[];
  timezone: string;
}) {
  const conversation = conversations[0];
  const [connected, setConnected] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const patientName = String(conversation?.patient_name || "Новый пациент");
  const firstName = patientName.split(" ")[0].replace("·", "");
  const upcoming = appointments.slice(0, 3);
  const patientAppointment = appointments.find(
    (appointment) =>
      String(appointment.patient_id) === String(conversation?.patient_id),
  );
  const doctor =
    doctors.find(
      (item) => String(item.id) === String(patientAppointment?.doctor_id || ""),
    ) || doctors[0];
  const dateTimeFormatter = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: timezone,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  function formatAppointment(value: string) {
    const parts = dateTimeFormatter.formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value || "";
    return `${part("day")} ${part("month")}, ${part("hour")}:${part("minute")}`;
  }

  function formatMessageTime(value: unknown) {
    if (!value) return "";
    const parts = dateTimeFormatter.formatToParts(new Date(String(value)));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value || "";
    return `${part("hour")}:${part("minute")}`;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
      <section className="min-w-0">
        <div className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
              <span className="size-2.5 rounded-full bg-[#5aa17e]" /> Входящий
              звонок{" "}
              <span className="rounded-full bg-[#e9f3ee] px-2 py-1 text-[10px] uppercase tracking-wide">
                sandbox
              </span>
            </div>
            <h1 className="font-editorial text-5xl leading-none text-[#1b2923] sm:text-6xl">
              Разговор с {firstName}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <User className="size-5" /> {patientName}
              </span>
              <span>Русский</span>
              <span className="flex items-center gap-2">
                <Stethoscope className="size-5" />{" "}
                {String(doctor?.specialty_name || "Терапия")}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="size-5" /> 02:18
              </span>
            </div>
          </div>
          <div className="grid min-w-[250px] gap-2">
            <button
              className="flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary font-semibold text-white shadow-sm hover:bg-[#064a31]"
              onClick={() => setConnected((value) => !value)}
              type="button"
            >
              <Phone className="size-5" />
              {connected ? "Подключено" : "Подключиться"}
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-border bg-white font-medium hover:border-primary/30"
              onClick={() => setTransferred(true)}
              type="button"
            >
              <ArrowBendUpLeft className="size-5" />
              {transferred ? "Передано оператору" : "Передать оператору"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[17px] border border-border bg-white/70 shadow-[0_12px_35px_rgba(28,62,50,.05)]">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_250px]">
            <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between px-5 py-4">
                <h2 className="font-semibold text-primary">
                  Разговор в реальном времени
                </h2>
                <div className="flex items-center gap-3 text-xs text-primary">
                  <span>AI слушает</span>
                  <span className="flex items-end gap-1">
                    {[8, 15, 11, 20, 7, 13, 18].map((height, index) => (
                      <i
                        className="w-[3px] rounded-full bg-primary"
                        key={index}
                        style={{ height }}
                      />
                    ))}
                  </span>
                </div>
              </div>
              <div className="space-y-4 px-5 pb-5">
                {messages.map((message) => {
                  const sender = String(message.sender_type);
                  const assistant = sender === "assistant";
                  return (
                    <div
                      className={`flex gap-3 ${assistant ? "mr-auto max-w-[82%]" : "ml-auto max-w-[78%] flex-row-reverse"}`}
                      key={String(message.id)}
                    >
                      {assistant && (
                        <span className="mt-2 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                          <Sparkle className="size-4" weight="fill" />
                        </span>
                      )}
                      <div
                        className={`rounded-[13px] border px-4 py-3 text-sm leading-6 ${assistant ? "border-[#cce0d6] bg-[#f2f7f4]" : "border-[#c7e2e8] bg-[#edf8fa]"}`}
                      >
                        {assistant && (
                          <b className="mb-1 block text-primary">AI Dos</b>
                        )}
                        {String(message.content)}
                        <time className="mt-1 block text-right text-[10px] text-muted-foreground">
                          {formatMessageTime(message.created_at)}
                        </time>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <aside className="p-5">
              <h2 className="mb-6 font-semibold text-primary">Действия AI</h2>
              {[
                [User, "Пациент найден", patientName],
                [
                  Stethoscope,
                  "Врач выбран",
                  String(doctor?.display_name || "Терапевт"),
                ],
                [CalendarBlank, "Проверяю расписание", "Ближайшие слоты"],
              ].map(([Icon, title, detail], index) => {
                const StepIcon = Icon as typeof User;
                return (
                  <div
                    className="relative flex gap-3 pb-8"
                    key={title as string}
                  >
                    {index < 2 && (
                      <span className="absolute left-[18px] top-9 h-[calc(100%-18px)] w-px bg-[#6ca087]" />
                    )}
                    <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                      <StepIcon className="size-4" />
                      <Check
                        className="absolute -right-1 -bottom-1 size-4 rounded-full bg-white p-0.5 text-primary"
                        weight="bold"
                      />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-primary">
                        {title as string}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {detail as string}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-3 text-muted-foreground">
                <span className="flex size-9 items-center justify-center rounded-full border border-border bg-muted">
                  <Check className="size-4" />
                </span>
                <p className="pt-2 text-sm">Подтверждение записи</p>
              </div>
            </aside>
          </div>
          <div className="border-t border-border p-4">
            <AssistantComposer
              conversationId={
                conversation?.id ? String(conversation.id) : undefined
              }
            />
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <div className="overflow-hidden rounded-[15px] border border-border bg-white/75">
          <div className="flex items-start gap-4 p-5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#cde9eb] text-xl text-primary">
              {firstName.slice(0, 1)}A
            </span>
            <div>
              <h2 className="text-xl font-semibold">{patientName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatPhone(conversation?.phone) || "Номер не указан"}
              </p>
            </div>
            <button
              className="ml-auto rounded-lg border border-border p-2 text-muted-foreground"
              type="button"
            >
              <DotsThree className="size-5" weight="bold" />
            </button>
          </div>
          <Link
            className="flex w-full items-center gap-3 border-t border-border px-5 py-4 text-sm font-medium hover:bg-muted/50"
            href="/portal/patients"
          >
            <FolderOpen className="size-5 text-muted-foreground" /> Открыть
            карту пациента <ArrowRightSmall />
          </Link>
          <div className="border-t border-border p-5">
            <h3 className="font-semibold text-primary">Краткая история</h3>
            <div className="mt-4 border-l border-border pl-4 text-sm">
              <p className="font-medium">Демонстрационный профиль</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Медицинские данные не загружаются в AI по умолчанию.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-[15px] border border-border bg-white/75 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-primary">Ближайшие записи</h3>
            <span className="text-xs text-muted-foreground">из живой БД</span>
          </div>
          <div className="space-y-2">
            {upcoming.length ? (
              upcoming.map((slot) => {
                const iso = new Date(String(slot.starts_at)).toISOString();
                return (
                  <div
                    className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-white p-3 text-left"
                    key={String(slot.id)}
                  >
                    <CalendarBlank className="size-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {formatAppointment(iso)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {String(slot.doctor_name || "Врач")}
                      </p>
                    </div>
                    <span className="ml-auto rounded-full bg-[#e9f3ee] px-2 py-1 text-[10px] font-semibold text-primary">
                      подтверждена
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="rounded-[10px] bg-muted p-4 text-sm text-muted-foreground">
                Предстоящие записи появятся после подтверждения в расписании.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 rounded-[12px] border border-[#bcdce1] bg-[#edf8fa] p-4 text-sm leading-6 text-[#28535b]">
          <Info className="mt-0.5 size-5 shrink-0" /> Свободное время выбирается
          в разделе «Расписание». AI не создаёт запись без явного действия
          оператора.
        </div>
      </aside>
    </div>
  );
}

function ArrowRightSmall() {
  return <span className="ml-auto text-lg text-muted-foreground">›</span>;
}
