"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { LanguageSwitcher } from "@/components/marketing/language-switcher";
import { useLocale } from "@/components/marketing/locale-context";

export function SiteHeader() {
  const { t } = useLocale();
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#evening", label: t.nav.evening },
    { href: "#call", label: t.nav.call },
    { href: "#voice", label: t.nav.voice },
    { href: "#limits", label: t.nav.limits },
  ];

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-300"
      style={{
        background: solid
          ? "color-mix(in srgb, var(--paper) 88%, transparent)"
          : "transparent",
        borderBottom: `1px solid ${solid ? "var(--rule)" : "transparent"}`,
        backdropFilter: solid ? "blur(16px)" : "none",
      }}
    >
      <div className="mx-auto flex h-[74px] max-w-[1280px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Brand className="font-display text-[25px]" style={{ color: "var(--ink)" }} />

        <nav aria-label="Основная навигация" className="hidden items-center gap-9 md:flex">
          {links.map((link) => (
            <Link
              className="text-[13px] font-medium tracking-wide transition-colors hover:text-[var(--primary)]"
              href={link.href}
              key={link.href}
              style={{ color: "var(--ink-2)" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <LanguageSwitcher tone="light" />
          <Link
            className="hidden text-[13px] font-semibold text-[var(--primary)] transition-opacity hover:opacity-70 lg:block"
            href="/assistant"
          >
            {t.cta.patient}
          </Link>
          <Link
            className="hidden text-[13px] font-medium transition-colors hover:text-[var(--primary)] sm:block"
            href="/login"
            style={{ color: "var(--ink-2)" }}
          >
            {t.cta.login}
          </Link>
          <Link
            className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold tracking-wide text-white transition hover:-translate-y-0.5 sm:px-5"
            href="/register"
            style={{ background: "var(--primary)" }}
          >
            {t.cta.create}
          </Link>
        </div>
      </div>
    </header>
  );
}
