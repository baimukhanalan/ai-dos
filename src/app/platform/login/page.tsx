import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { PlatformLoginForm } from "@/components/platform/platform-login-form";
import { requirePlatformAdmin } from "@/lib/dal/auth";
import { readSession } from "@/lib/session";

export const metadata: Metadata = { title: "Управление платформой" };

export default async function PlatformLoginPage() {
  const session = await readSession();
  if (session?.scope === "platform") {
    const validPlatformSession = await requirePlatformAdmin().then(() => true).catch(() => false);
    if (validPlatformSession) redirect("/platform");
  }
  return (
    <main className="min-h-screen bg-[#fbfaf6] px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]"><Brand className="text-[28px]" href="/" /></div>
      <div className="mx-auto grid min-h-[calc(100vh-90px)] max-w-[1100px] items-center gap-12 py-10 lg:grid-cols-[1fr_.8fr]">
        <section className="max-w-[620px]">
          <h1 className="font-editorial text-[clamp(3rem,5vw,4.8rem)] leading-[.94] text-[#17241f]">
            Управление платформой
          </h1>
          <p className="mt-6 max-w-[560px] text-lg leading-8 text-muted-foreground">
            Отдельный защищённый контур для владельца AI Dos. Tenant-доступ клиники здесь не работает.
          </p>
          <PlatformLoginForm />
        </section>
        <aside className="rounded-[16px] border border-border bg-[#f3f8f5] p-8 lg:p-10">
          <h2 className="font-editorial text-3xl text-primary">Cross-tenant доступ без данных пациентов</h2>
          <div className="mt-8 space-y-6 text-sm leading-6 text-muted-foreground">
            <p><b className="text-foreground">Отдельная сессия.</b> Платформенный вход нельзя использовать в портале клиники.</p>
            <p><b className="text-foreground">Агрегированные данные.</b> Super Admin видит состояние tenant, usage, очереди и интеграции — не медицинские записи.</p>
            <p><b className="text-foreground">Полный аудит.</b> Успешные и неуспешные входы, а также изменения статусов журналируются отдельно.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
