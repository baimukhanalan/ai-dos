"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone } from "@phosphor-icons/react";
import { useLocale } from "@/components/marketing/locale-context";

export function Hero() {
  const { t } = useLocale();

  return (
    <section className="paper-grain relative overflow-hidden" id="intro" style={{ background: "var(--paper)" }}>
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:gap-16 lg:px-12 lg:pb-24 lg:pt-36">
        <div>
          <p className="eyebrow flex items-center gap-3" style={{ color: "var(--brass)" }}>
            00
            <span aria-hidden className="h-px w-8" style={{ background: "currentColor", opacity: 0.5 }} />
            {t.hero.eyebrow}
          </p>

          <h1 className="font-display mt-6 text-[clamp(2.6rem,5.4vw,4.9rem)] leading-[0.98]" style={{ color: "var(--ink)" }}>
            {t.hero.titleTop}
            <span className="mt-1 block italic" style={{ color: "var(--primary)" }}>
              {t.hero.titleAccent}
            </span>
          </h1>

          <p className="mt-7 max-w-[46ch] text-lg leading-8" style={{ color: "var(--ink-3)" }}>
            {t.hero.lead}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex h-14 items-center justify-center gap-2.5 rounded-full px-8 text-sm font-semibold tracking-wide text-white transition hover:-translate-y-0.5"
              href="/register"
              style={{ background: "var(--primary)" }}
            >
              {t.cta.create} <ArrowRight className="size-4" />
            </Link>
            <Link
              className="inline-flex h-14 items-center justify-center rounded-full px-8 text-sm font-semibold tracking-wide transition hover:-translate-y-0.5"
              href="#evening"
              style={{ border: "1px solid var(--rule-strong)", color: "var(--ink)" }}
            >
              {t.cta.how}
            </Link>
          </div>
        </div>

        {/* Правая панель: светлый кадр клиники с плавающей карточкой */}
        <div className="relative">
          <div
            className="relative aspect-[4/3] overflow-hidden rounded-[22px]"
            style={{ boxShadow: "0 30px 70px rgba(22,50,41,.16)" }}
          >
            <Image
              alt="Светлая регистратура клиники с мягким дневным светом"
              className="object-cover object-center"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 620px"
              src="/hero/clinic-reception.jpg"
            />
          </div>

          <div
            className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl px-5 py-4 backdrop-blur-md sm:left-8"
            style={{
              background: "color-mix(in srgb, var(--paper) 82%, transparent)",
              border: "1px solid var(--rule)",
              boxShadow: "0 16px 34px rgba(22,50,41,.12)",
            }}
          >
            <span
              className="flex size-10 items-center justify-center rounded-full text-white"
              style={{ background: "var(--primary)" }}
            >
              <Phone className="size-5" weight="fill" />
            </span>
            <div>
              <p className="font-display text-lg leading-none" style={{ color: "var(--ink)" }}>
                24 / 7
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                RU · KZ · EN
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
