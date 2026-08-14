import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/page-header";
import {
  EmptyModule,
  ModuleSection,
  StatusPill,
} from "@/components/portal/module-section";
import { getClinicHub } from "@/lib/dal/portal";
import { StaffInviteForm } from "@/components/portal/staff-invite-form";
import { requirePageRoles } from "@/lib/dal/auth";

export const metadata: Metadata = { title: "Клиника" };
export const dynamic = "force-dynamic";

export default async function ClinicPage() {
  await requirePageRoles(["clinic_admin"]);
  const data = await getClinicHub();
  const money = new Intl.NumberFormat("ru-KZ");
  return (
    <>
      <PageHeader
        eyebrow="Структура и доступы"
        title="Клиника"
        description="Филиалы, отделения, врачи, сотрудники, услуги, цены, роли и права внутри текущего tenant."
      />
      <div className="mb-5">
        <StaffInviteForm
          doctors={data.doctors
            .filter((item) => item.active && !item.linked_user_id)
            .map((item) => ({ id: String(item.id), name: String(item.full_name) }))}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ModuleSection count={data.branches.length} description="Адреса, телефоны и часовые пояса." id="branches" title="Филиалы">
          {data.branches.length ? data.branches.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
              <div><p className="font-semibold">{String(item.name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.address || "Адрес не указан")} · {String(item.timezone)}</p></div>
              <StatusPill status={item.active ? "active" : "paused"} />
            </article>
          )) : <EmptyModule>Добавьте первый филиал клиники.</EmptyModule>}
        </ModuleSection>

        <ModuleSection count={data.departments.length} description="Подразделения внутри филиалов." id="departments" title="Отделения">
          {data.departments.length ? data.departments.map((item) => (
            <article className="border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}><p className="font-semibold">{String(item.name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.branch_name || "Все филиалы")} · {String(item.description || "Описание не указано")}</p></article>
          )) : <EmptyModule>Отделения ещё не настроены.</EmptyModule>}
        </ModuleSection>

        <ModuleSection count={data.doctors.length} description="Специализация, языки, кабинет и загрузка." id="doctors" title="Врачи">
          {data.doctors.length ? data.doctors.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
              <div><p className="font-semibold">{String(item.display_name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.specialty_name || "Специалист")} · {String((item.languages as string[]).join(", "))} · кабинет {String(item.room || "—")}</p></div>
              <span className="text-xs font-semibold text-primary">{String(item.upcoming_count)} будущих</span>
            </article>
          )) : <EmptyModule>Врачи ещё не добавлены.</EmptyModule>}
        </ModuleSection>

        <ModuleSection count={data.staff.length + data.invitations.length} description="Сотрудники, роли и статус доступа." id="staff" title="Сотрудники">
          {data.staff.length ? data.staff.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
              <div><p className="font-semibold">{String(item.full_name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.email)} · {String(item.role_names)}</p></div>
              <StatusPill status={String(item.status)} />
            </article>
          )) : <EmptyModule>Сотрудники ещё не приглашены.</EmptyModule>}
          {data.invitations.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-t border-border/70 px-5 py-4" key={String(item.id)}>
              <div><p className="font-semibold">{String(item.full_name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.email)} · приглашение {String(item.role_code)}</p></div>
              <StatusPill status="pending" />
            </article>
          ))}
        </ModuleSection>

        <ModuleSection count={data.services.length} description="Прайс, продолжительность и привязка к специальности." id="services" title="Услуги и цены">
          {data.services.length ? data.services.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
              <div><p className="font-semibold">{String(item.name)}</p><p className="mt-1 text-sm text-muted-foreground">{String(item.specialty_name || "Общая услуга")} · {String(item.duration_minutes)} минут</p></div>
              <span className="font-semibold text-primary">{item.price_kzt ? `${money.format(Number(item.price_kzt))} ₸` : "По запросу"}</span>
            </article>
          )) : <EmptyModule>Услуги и цены ещё не заполнены.</EmptyModule>}
        </ModuleSection>

        <ModuleSection count={data.roles.length} description="RBAC: роли, назначенные сотрудники и наборы прав." id="access" title="Роли и права">
          {data.roles.length ? data.roles.map((item) => (
            <article className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/70 px-5 py-4 last:border-0" key={String(item.id)}>
              <div><p className="font-semibold">{String(item.name)}</p><p className="mt-1 text-xs text-muted-foreground">{String(item.code)} · {String(item.permission_count)} прав</p></div>
              <span className="text-xs font-semibold text-primary">{String(item.user_count)} сотрудников</span>
            </article>
          )) : <EmptyModule>Роли ещё не созданы.</EmptyModule>}
        </ModuleSection>
      </div>
    </>
  );
}
