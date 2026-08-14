import { Brand } from "@/components/brand";
import { PortalNav } from "@/components/portal/portal-nav";
import { requirePageUser } from "@/lib/dal/auth";
import {
  brandingStyle,
  defaultBranding,
  getTenantBranding,
} from "@/lib/branding";
import { db } from "@/lib/db";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageUser();
  const branding = await getTenantBranding(db(), user.tenantId).catch(
    () => defaultBranding,
  );
  const workspaceName = branding.displayName || user.tenantName;
  const initials = user.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  const homeHref = user.role === "doctor" ? "/portal/doctor" : "/portal";
  const roleLabel =
    user.role === "clinic_admin"
      ? "Администратор"
      : user.role === "doctor"
        ? "Врач"
        : "Регистратор";
  return (
    <div
      className="min-h-screen bg-[#fbfaf6] md:grid md:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]"
      style={brandingStyle(branding)}
    >
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border/80 bg-[#f7f7f2] md:flex">
        <div className="flex h-[82px] items-center gap-3 border-b border-border/80 px-6">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- логотип клиники хранится на её домене, оптимизация не нужна
            <img
              alt={workspaceName}
              className="max-h-9 w-auto max-w-[160px] object-contain"
              src={branding.logoUrl}
            />
          ) : (
            <Brand className="text-[28px]" href={homeHref} />
          )}
        </div>
        <div className="border-b border-border/70 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-primary text-sm font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {roleLabel}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-[10px] border border-border/80 bg-white/75 px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-primary">
              {workspaceName}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Рабочее пространство клиники
            </p>
          </div>
        </div>
        <PortalNav role={user.role} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-border/80 bg-[#fbfaf6]/92 backdrop-blur-xl md:hidden">
          <div className="flex h-[76px] items-center gap-3 px-4 sm:px-7">
            <Brand className="shrink-0 text-[26px]" href={homeHref} />
            <PortalNav role={user.role} variant="mobile" />
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-9 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
