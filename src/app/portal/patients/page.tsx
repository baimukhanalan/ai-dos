import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { UserCircle } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/portal/page-header";
import { PatientCreateForm } from "@/components/portal/patient-create-form";
import { getPatients } from "@/lib/dal/portal";
import { requirePageRoles } from "@/lib/dal/auth";
import { formatPhone } from "@/lib/utils";

export const metadata: Metadata = { title: "Пациенты" };
export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  await requirePageRoles(["clinic_admin", "operator"]);
  const { patients } = await getPatients();
  return (
    <>
      <PageHeader
        eyebrow="Реестр"
        title="Пациенты"
        description="Профили, предпочтительный язык и история записей остаются внутри рабочего пространства клиники."
      >
        <PatientCreateForm />
      </PageHeader>
      <div className="overflow-hidden rounded-[16px] border border-border bg-white/70">
        <div className="grid grid-cols-[1.5fr_1fr_.8fr_.7fr] gap-4 border-b border-border bg-[#f2f5f1] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden">
          <span>Пациент</span>
          <span>Контакт</span>
          <span>Последняя запись</span>
          <span>Всего</span>
        </div>
        {patients.length ? (
          patients.map((patient) => (
            <Link
              className="grid gap-4 border-b border-border/70 px-5 py-4 last:border-0 hover:bg-[#f4f7f2] md:grid-cols-[1.5fr_1fr_.8fr_.7fr] md:items-center"
              href={`/portal/patients/${String(patient.id)}`}
              key={String(patient.id)}
            >
              <div className="flex items-center gap-3">
                <UserCircle
                  className="size-10 text-[#6c9c87]"
                  weight="duotone"
                />
                <div>
                  <h2 className="font-semibold">{String(patient.full_name)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {patient.birth_date
                      ? format(
                          new Date(String(patient.birth_date)),
                          "d MMMM yyyy",
                          { locale: ru },
                        )
                      : "Дата рождения не указана"}
                  </p>
                </div>
              </div>
              <div className="text-sm">
                <p>{formatPhone(patient.phone) || "—"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {String(patient.email || patient.preferred_language || "ru")}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {patient.last_appointment_at
                  ? format(
                      new Date(String(patient.last_appointment_at)),
                      "d MMM, HH:mm",
                      { locale: ru },
                    )
                  : "Нет записей"}
              </p>
              <p className="text-sm font-semibold text-primary">
                {String(patient.appointment_count)}
              </p>
            </Link>
          ))
        ) : (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Добавьте первого пациента — запись появится здесь.
          </p>
        )}
      </div>
    </>
  );
}
