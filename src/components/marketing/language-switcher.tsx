"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "@phosphor-icons/react";
import { locales, localeNames, localeShort } from "@/components/marketing/i18n";
import { useLocale } from "@/components/marketing/locale-context";

/**
 * Иконка-глобус с выпадающим списком трёх языков. Меняет язык всей страницы
 * на месте, без перезагрузки, и запоминает выбор.
 */
export function LanguageSwitcher({ tone }: { tone: "light" | "dark" }) {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const trigger = tone === "dark" ? "rgba(241,237,226,.85)" : "var(--ink-2)";

  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Выбрать язык"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold tracking-wide transition hover:border-[var(--brass)]"
        onClick={() => setOpen((v) => !v)}
        style={{
          borderColor: tone === "dark" ? "rgba(241,237,226,.3)" : "var(--rule)",
          color: trigger,
        }}
        type="button"
      >
        <Globe className="size-4" weight="regular" />
        {localeShort[locale]}
      </button>

      {open && (
        <ul
          className="absolute right-0 top-11 z-50 min-w-[160px] overflow-hidden rounded-[12px] border py-1 shadow-[0_18px_40px_rgba(20,45,35,.14)]"
          role="listbox"
          style={{ background: "var(--paper)", borderColor: "var(--rule)" }}
        >
          {locales.map((code) => {
            const active = code === locale;
            return (
              <li key={code}>
                <button
                  aria-selected={active}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-[var(--wash)]"
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  role="option"
                  type="button"
                  style={{
                    color: active ? "var(--primary)" : "var(--ink-2)",
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {localeNames[code]}
                  <span className="text-[11px] tracking-wide" style={{ color: "var(--brass)" }}>
                    {active ? localeShort[code] : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
