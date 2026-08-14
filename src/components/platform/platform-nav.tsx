"use client";

import { useRouter } from "next/navigation";
import {
  Buildings,
  ChartBar,
  CreditCard,
  Flag,
  ListChecks,
  PlugsConnected,
  ShieldCheck,
  SignOut,
  SquaresFour,
} from "@phosphor-icons/react";

const links = [
  { href: "#overview", label: "Обзор", icon: SquaresFour },
  { href: "#tenants", label: "Клиники", icon: Buildings },
  { href: "#subscriptions", label: "Подписки", icon: CreditCard },
  { href: "#usage", label: "Usage", icon: ChartBar },
  { href: "#integrations", label: "Интеграции", icon: PlugsConnected },
  { href: "#queues", label: "Очереди", icon: ListChecks },
  { href: "#flags", label: "Feature flags", icon: Flag },
  { href: "#audit", label: "Аудит", icon: ShieldCheck },
];

export function PlatformNav() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/platform/login");
    router.refresh();
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Навигация управления платформой" className="space-y-1 px-3 py-5">
        {links.map(({ href, label, icon: Icon }, index) => (
          <a
            className={`flex h-11 items-center gap-3 rounded-[9px] px-3 text-sm font-medium transition-colors hover:bg-[#edf5f0] hover:text-primary ${index === 0 ? "bg-[#e7f2eb] text-primary" : "text-muted-foreground"}`}
            href={href}
            key={href}
          >
            <Icon className="size-[18px]" /> {label}
          </a>
        ))}
      </nav>
      <button
        className="mt-auto flex h-12 items-center gap-3 border-t border-border/70 px-6 text-sm text-muted-foreground hover:text-primary"
        onClick={logout}
        type="button"
      >
        <SignOut className="size-[18px]" /> Выйти
      </button>
    </div>
  );
}
