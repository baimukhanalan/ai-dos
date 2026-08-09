"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AddressBook,
  BookOpenText,
  Buildings,
  CalendarDots,
  ChartBar,
  ChatCenteredText,
  CreditCard,
  FlowArrow,
  GearSix,
  Headset,
  MicrophoneStage,
  SlidersHorizontal,
  SignOut,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/portal", label: "Разговоры", icon: ChatCenteredText },
  { href: "/portal/voice", label: "Голос", icon: MicrophoneStage },
  { href: "/portal/operations", label: "Операции", icon: Headset },
  { href: "/portal/schedule", label: "Расписание", icon: CalendarDots },
  { href: "/portal/patients", label: "Пациенты", icon: AddressBook },
  { href: "/portal/clinic", label: "Клиника", icon: Buildings },
  { href: "/portal/knowledge", label: "База знаний", icon: BookOpenText },
  { href: "/portal/automations", label: "Автоматизация", icon: FlowArrow },
  { href: "/portal/reports", label: "Отчёты", icon: ChartBar },
  { href: "/portal/billing", label: "Тариф", icon: CreditCard },
  { href: "/portal/administration", label: "Управление", icon: GearSix },
  { href: "/portal/settings", label: "Настройки", icon: SlidersHorizontal },
];

export function PortalNav({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "mobile";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sidebar = variant === "sidebar";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div
      className={cn(
        sidebar
          ? "flex min-h-0 flex-1 flex-col"
          : "flex min-w-0 flex-1 items-center gap-1",
      )}
    >
      <nav
        className={cn(
          sidebar
            ? "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"
            : "hide-scrollbar flex max-w-[calc(100vw-116px)] items-center gap-1 overflow-x-auto",
        )}
        aria-label="Навигация портала"
      >
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/portal" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              className={cn(
                "group relative flex shrink-0 items-center gap-3 font-medium text-muted-foreground transition hover:bg-[#f0f4ef] hover:text-primary",
                sidebar
                  ? "h-11 rounded-[10px] px-3 text-sm"
                  : "h-[68px] px-3 text-xs",
                active &&
                  (sidebar
                    ? "bg-[#e4f1e9] font-semibold text-primary"
                    : "text-primary"),
              )}
              href={href}
              key={href}
            >
              <Icon className="size-5" weight={active ? "fill" : "regular"} />
              {label}
              {active && !sidebar && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>
      <button
        className={cn(
          "flex shrink-0 items-center text-muted-foreground transition hover:bg-muted hover:text-primary",
          sidebar
            ? "mx-3 mb-4 h-11 gap-3 rounded-[10px] px-3 text-sm font-medium"
            : "ml-1 size-9 justify-center rounded-full",
        )}
        onClick={logout}
        type="button"
        title="Выйти"
      >
        <SignOut className="size-5" />
        {sidebar ? "Выйти" : null}
      </button>
    </div>
  );
}
