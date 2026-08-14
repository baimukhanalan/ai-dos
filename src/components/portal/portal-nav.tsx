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
  Stethoscope,
  SlidersHorizontal,
  SignOut,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/portal", label: "Разговоры", icon: ChatCenteredText, roles: ["clinic_admin", "operator"] },
  { href: "/portal/doctor", label: "Мой кабинет", icon: Stethoscope, roles: ["doctor"] },
  { href: "/portal/voice", label: "Голос", icon: MicrophoneStage, roles: ["clinic_admin", "operator"] },
  { href: "/portal/operations", label: "Операции", icon: Headset, roles: ["clinic_admin", "operator"] },
  { href: "/portal/schedule", label: "Расписание", icon: CalendarDots, roles: ["clinic_admin", "operator"] },
  { href: "/portal/patients", label: "Пациенты", icon: AddressBook, roles: ["clinic_admin", "operator"] },
  { href: "/portal/clinic", label: "Клиника", icon: Buildings, roles: ["clinic_admin"] },
  { href: "/portal/knowledge", label: "База знаний", icon: BookOpenText, roles: ["clinic_admin", "operator"] },
  { href: "/portal/automations", label: "Автоматизация", icon: FlowArrow, roles: ["clinic_admin"] },
  { href: "/portal/reports", label: "Отчёты", icon: ChartBar, roles: ["clinic_admin", "operator"] },
  { href: "/portal/billing", label: "Тариф", icon: CreditCard, roles: ["clinic_admin"] },
  { href: "/portal/administration", label: "Управление", icon: GearSix, roles: ["clinic_admin"] },
  { href: "/portal/settings", label: "Настройки", icon: SlidersHorizontal, roles: ["clinic_admin"] },
];

export function PortalNav({
  variant = "sidebar",
  role,
}: {
  variant?: "sidebar" | "mobile";
  role: string;
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
        {links.filter((item) => item.roles.includes(role)).map(({ href, label, icon: Icon }) => {
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
