import { Brand } from "@/components/brand";
import { PlatformNav } from "@/components/platform/platform-nav";
import { requirePlatformPage } from "@/lib/dal/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformPage();
  const initials = admin.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("");
  return (
    <div className="min-h-screen bg-[#fbfaf6] md:grid md:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="hidden h-screen flex-col border-r border-border/80 bg-[#f8f9f5] md:sticky md:top-0 md:flex">
        <div className="border-b border-border/70 px-6 py-7"><Brand className="text-[28px]" href="/platform" /></div>
        <div className="border-b border-border/70 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-primary text-xs font-bold text-white">{initials}</span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{admin.fullName}</p><p className="mt-1 text-xs text-muted-foreground">Super Admin</p></div>
          </div>
          <div className="mt-4 rounded-[10px] border border-border bg-white/60 px-3 py-3"><p className="text-xs font-semibold text-primary">AI Dos Platform</p><p className="mt-1 text-[11px] text-muted-foreground">Cross-tenant operations</p></div>
        </div>
        <PlatformNav />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-border/80 bg-[#fbfaf6]/95 px-4 py-4 backdrop-blur md:hidden">
          <div className="flex items-center justify-between"><Brand className="text-[25px]" href="/platform" /><span className="text-xs font-semibold text-primary">Super Admin</span></div>
          <div className="mt-3 overflow-x-auto"><div className="flex min-w-max gap-2 text-xs"><a className="rounded-full bg-[#e7f2eb] px-3 py-2 text-primary" href="#overview">Обзор</a><a className="rounded-full border border-border px-3 py-2" href="#tenants">Клиники</a><a className="rounded-full border border-border px-3 py-2" href="#queues">Очереди</a><a className="rounded-full border border-border px-3 py-2" href="#audit">Аудит</a></div></div>
        </header>
        <main className="mx-auto max-w-[1540px] px-4 py-7 sm:px-7 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
