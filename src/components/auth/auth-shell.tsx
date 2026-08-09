import {
  CalendarBlank,
  Check,
  LockKey,
  Stethoscope,
  User,
} from "@phosphor-icons/react/dist/ssr";
import { Brand } from "@/components/brand";

const steps = [
  {
    icon: User,
    title: "Пациент найден",
    body: "Профиль и предпочтительный язык",
  },
  { icon: Stethoscope, title: "Врач выбран", body: "Специалист и вид приёма" },
  {
    icon: CalendarBlank,
    title: "Расписание проверено",
    body: "Ближайшее удобное время",
  },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-[#fbfaf6] px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <Brand />
      </div>
      <div className="mx-auto grid min-h-[calc(100vh-90px)] max-w-[1200px] items-center gap-12 py-10 lg:grid-cols-[1.25fr_.8fr]">
        <section>{children}</section>
        <aside className="medical-grid hidden min-h-[750px] rounded-[18px] border border-[#cdd6d0] bg-[#f5faf7]/80 p-10 lg:flex lg:flex-col">
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-primary">
            Один рабочий контур
          </p>
          <div className="mt-14 flex-1">
            {steps.map(({ icon: Icon, title, body }, index) => (
              <div className="relative flex gap-5 pb-16" key={title}>
                {index < steps.length - 1 && (
                  <span className="absolute left-[27px] top-12 h-[calc(100%-14px)] w-px bg-[#559476]" />
                )}
                <span className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <Icon className="size-6" />
                  <Check
                    className="absolute -bottom-1 -right-1 size-5 rounded-full bg-white p-1 text-primary"
                    weight="bold"
                  />
                </span>
                <div className="pt-1">
                  <h2 className="font-semibold text-primary">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {body}
                  </p>
                  <time className="mt-2 block text-xs text-muted-foreground">
                    10:{40 + index}
                  </time>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-8">
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-full bg-[#e4f1eb] text-primary">
                <LockKey className="size-6" />
              </span>
              <p className="font-medium">
                Все обращения —<br />в одном рабочем пространстве.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs text-muted-foreground lg:flex">
        <LockKey className="size-4 text-primary" /> Защищённое соединение
      </div>
    </main>
  );
}
