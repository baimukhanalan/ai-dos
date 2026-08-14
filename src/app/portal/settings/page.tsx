import type { Metadata } from "next";
import {
  Brain,
  CheckCircle,
  Database,
  Globe,
  HourglassMedium,
  LockKey,
  Microphone,
  PlugsConnected,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/portal/page-header";
import { requirePageRoles } from "@/lib/dal/auth";
import {
  misIntegrationLabel,
  misIntegrationStatus,
} from "@/lib/integrations/mis-status";

export const metadata: Metadata = { title: "Настройки" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageRoles(["clinic_admin"]);
  const safeAiMode = process.env.AI_RUNTIME !== "openai";
  const misStatus = misIntegrationStatus();
  const integrations = [
    {
      icon: Database,
      name: "PostgreSQL",
      detail: "Защищённое серверное соединение",
      status: "Подключено",
      active: true,
    },
    {
      icon: Brain,
      name: safeAiMode ? "AI Dos Safe Mode" : "OpenAI",
      detail: safeAiMode
        ? "Операционные ответы и экстренная эскалация"
        : process.env.OPENAI_MODEL || "gpt-5.6",
      status:
        safeAiMode || process.env.OPENAI_API_KEY ? "Активен" : "Не настроено",
      active: safeAiMode || Boolean(process.env.OPENAI_API_KEY),
    },
    {
      icon: Microphone,
      name: "Gemini Live",
      detail: "Нативный многоязычный аудиодиалог в браузере",
      status: process.env.GEMINI_API_KEY ? "Активен" : "Не настроено",
      active: Boolean(process.env.GEMINI_API_KEY),
    },
    {
      icon: PlugsConnected,
      name: "DAMUMED",
      detail:
        misStatus.startsWith("approved_bridge")
          ? "Локальный мост в авторизованном Chrome клиники"
          : "Официальный API или письменно одобренный шлюз",
      status: misIntegrationLabel(misStatus),
      active: misStatus === "approved_bridge_ready",
    },
    {
      icon: Globe,
      name: "Web‑канал",
      detail: "Портал AI Dos",
      status: "Sandbox",
      active: true,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Рабочее пространство"
        title="Настройки"
        description="Состояние инфраструктуры, интеграций и границы текущего запуска."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-[16px] border border-border bg-white/70">
          <div className="border-b border-border px-5 py-4 font-semibold">
            Интеграции
          </div>
          {integrations.map(({ icon: Icon, name, detail, status, active }) => (
            <article
              className="flex items-center gap-4 border-b border-border/70 px-5 py-5 last:border-0"
              key={name}
            >
              <span className="flex size-11 items-center justify-center rounded-[11px] bg-[#e7f2ec] text-primary">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{name}</h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {detail}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-[#e0f2e8] text-primary" : "bg-[#fff3d9] text-[#7c5d13]"}`}
              >
                {active ? (
                  <CheckCircle className="size-4" weight="fill" />
                ) : (
                  <HourglassMedium className="size-4" />
                )}
                {status}
              </span>
            </article>
          ))}
        </section>
        <aside className="space-y-3">
          <div className="rounded-[15px] border border-border bg-white/70 p-5">
            <LockKey className="size-6 text-primary" />
            <h2 className="mt-6 font-semibold">{user.tenantName}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              ID рабочего пространства
            </p>
            <code className="mt-2 block break-all rounded-lg bg-muted p-3 text-xs">
              {user.tenantId}
            </code>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Роль: {user.role}. Все DAL-запросы получают tenant ID из
              подписанной серверной сессии.
            </p>
          </div>
          <div className="rounded-[15px] border border-[#c8dfe2] bg-[#edf8fa] p-5 text-sm leading-6 text-[#2f5961]">
            Провайдеры телефонии, WhatsApp и Telegram подключаются отдельно
            после выдачи учётных данных. Портал и web‑канал уже работают без
            них.
          </div>
        </aside>
      </div>
    </>
  );
}
