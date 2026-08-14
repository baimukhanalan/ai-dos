import type { Metadata } from "next";
import {
  CalendarBlank,
  Clock,
  Stethoscope,
} from "@phosphor-icons/react/dist/ssr";
import { AppointmentCreateForm } from "@/components/portal/appointment-create-form";
import { AppointmentActions } from "@/components/portal/appointment-actions";
import { PageHeader } from "@/components/portal/page-header";
import { getSchedule } from "@/lib/dal/portal";
import { requirePageRoles } from "@/lib/dal/auth";

export const metadata: Metadata = { title: "Расписание" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await requirePageRoles(["clinic_admin", "operator"]);
  const data = await getSchedule();
  const dayFormatter = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: data.user.timezone,
    day: "numeric",
    month: "long",
  });
  const timeFormatter = new Intl.DateTimeFormat("ru-KZ", {
    timeZone: data.user.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <>
      <PageHeader
        eyebrow="Операционный день"
        title="Расписание"
        description="Записи создаются с idempotency‑ключом и проверкой занятости врача в живой базе данных."
      >
        <AppointmentCreateForm
          patients={data.patients}
          doctors={data.doctors}
          services={data.services}
          timezone={data.user.timezone}
        />
      </PageHeader>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <section className="overflow-hidden rounded-[16px] border border-border bg-white/70">
          <div className="border-b border-border bg-[#f2f5f1] px-5 py-4 font-semibold">
            Ближайшие 14 дней
          </div>
          {data.appointments.length ? (
            data.appointments.map((item) => (
              <article
                className="grid gap-4 border-b border-border/70 px-5 py-4 last:border-0 sm:grid-cols-[150px_1fr_auto] sm:items-start"
                key={String(item.id)}
              >
                <div>
                  <p className="font-semibold text-primary">
                    {dayFormatter.format(new Date(String(item.starts_at)))}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    {timeFormatter.format(new Date(String(item.starts_at)))}–
                    {timeFormatter.format(new Date(String(item.ends_at)))}
                  </p>
                </div>
                <div>
                  <h2 className="font-semibold">{String(item.patient_name)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {String(item.doctor_name)} ·{" "}
                    {String(item.service_name || "Приём")}
                  </p>
                </div>
                {item.status === "confirmed" ? <AppointmentActions id={String(item.id)} /> : <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{String(item.status)}</span>}
              </article>
            ))
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">
              Записей пока нет.
            </p>
          )}
        </section>
        <aside className="space-y-3">
          <h2 className="font-semibold text-primary">Врачи сегодня</h2>
          {data.doctors.map((doctor) => (
            <div
              className="rounded-[13px] border border-border bg-white/70 p-4"
              key={String(doctor.id)}
            >
              <Stethoscope className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">
                {String(doctor.display_name)}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {String(doctor.specialty_name || "Специалист")} · кабинет{" "}
                {String(doctor.room || "—")}
              </p>
            </div>
          ))}
          <div className="flex gap-3 rounded-[13px] border border-[#c8dfe2] bg-[#eef8fa] p-4 text-sm leading-6 text-[#2f5961]">
            <CalendarBlank className="mt-0.5 size-5 shrink-0" /> DAMUMED не
            используется до получения официального API.
          </div>
        </aside>
      </div>
    </>
  );
}
