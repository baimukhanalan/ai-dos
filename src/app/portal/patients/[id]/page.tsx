import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarPlus, Phone } from "@phosphor-icons/react/dist/ssr";
import { Patient360Workspace } from "@/components/portal/patient-360-workspace";
import { getPatient360 } from "@/lib/dal/patient-360";
import { maskPatientPhone, type PatientTimelineEvent } from "@/lib/patient-360";

export const metadata: Metadata = { title: "Профиль пациента" };
export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPatient360(id);
  const patient = data.patient as Record<string, unknown>;
  const consents = data.consents as Array<Record<string, unknown>>;
  return (
    <div className="space-y-6">
      <div>
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/portal/patients"><ArrowLeft className="size-4" /> Пациенты</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div><h1 className="font-heading text-4xl leading-none tracking-tight text-foreground sm:text-5xl">{String(patient.full_name)}</h1><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{maskPatientPhone(patient.phone)}</span><span>Язык: {languageLabel(String(patient.preferred_language || "ru"))}</span></div></div>
          <div className="flex flex-wrap gap-3"><Link className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-primary px-4 text-sm font-semibold text-primary hover:bg-secondary" href={`/portal/schedule?patient=${id}`}><CalendarPlus className="size-5" /> Создать запись</Link><Link className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-[#064b32]" href="/portal/voice"><Phone className="size-5" /> Позвонить</Link></div>
        </div>
      </div>
      <div className="grid gap-px overflow-hidden rounded-[16px] border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"><Stat label="Следующая запись" value={formatDate(patient.next_appointment_at)} /><Stat label="Последняя запись" value={formatDate(patient.last_appointment_at)} /><Stat label="Всего взаимодействий" value={String(data.events.length)} /><Stat label="Записей" value={String(patient.appointment_count || 0)} /></div>
      <Patient360Workspace consents={consents} events={data.events as PatientTimelineEvent[]} patientId={id} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="bg-white/80 px-5 py-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{value}</p></div>; }
function formatDate(value: unknown) { if (!value) return "Нет данных"; return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }).format(new Date(String(value))); }
function languageLabel(value: string) { return ({ ru: "Русский", kk: "Қазақша", en: "English" } as Record<string, string>)[value] || value; }
