"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { Brand } from "@/components/brand";
import { useLocale } from "@/components/marketing/locale-context";
import { useReveal } from "@/components/marketing/use-reveal";

function ChapterMark({ index, label }: { index: string; label: string }) {
  return (
    <p className="eyebrow flex items-center gap-3">
      <span style={{ color: "var(--brass)" }}>{index}</span>
      <span aria-hidden className="h-px w-8" style={{ background: "currentColor", opacity: 0.3 }} />
      {label}
    </p>
  );
}

export function StoryBody() {
  const { t } = useLocale();
  const ref = useReveal<HTMLDivElement>();

  return (
    <div ref={ref}>
      {/* Три обещания */}
      <section className="paper-grain" style={{ background: "var(--paper)" }}>
        <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-14 sm:px-8 lg:px-12 lg:pb-20 lg:pt-20">
          <div className="grid gap-px sm:grid-cols-3" style={{ background: "var(--rule)" }}>
            {t.promises.map((item) => (
              <div className="pt-6 sm:pr-8" data-reveal key={item.title} style={{ background: "var(--paper)" }}>
                <h2 className="font-display text-2xl" style={{ color: "var(--ink)" }}>{item.title}</h2>
                <p className="mt-3 max-w-[34ch] text-sm leading-6" style={{ color: "var(--ink-3)" }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 01 — Вечер */}
      <section id="evening" style={{ background: "var(--wash)" }}>
        <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div data-reveal>
            <ChapterMark index="01" label={t.evening.mark} />
            <h2 className="font-display mt-8 max-w-[18ch] text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.03]" style={{ color: "var(--ink)" }}>
              {t.evening.title}
            </h2>
            <p className="mt-6 max-w-[52ch] text-base leading-8" style={{ color: "var(--ink-3)" }}>
              {t.evening.lead}
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-2" data-reveal>
            <div className="rounded-[18px] p-8 lg:p-10" style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}>
              <p className="eyebrow" style={{ color: "var(--ink-3)" }}>{t.evening.nowLabel}</p>
              <ol className="mt-8 space-y-6">
                {t.evening.without.map((step, index) => (
                  <li className="grid grid-cols-[4.5rem_1fr] gap-5" key={`${step.time}-${index}`}>
                    <span className="font-display text-lg tabular-nums" style={{ color: "var(--ink-3)", opacity: 0.6 }}>
                      {step.time}
                    </span>
                    <span className="text-[15px] leading-7" style={{ color: step.muted ? "var(--ink-3)" : "var(--ink-2)", opacity: step.muted ? 0.55 : 1 }}>
                      {step.text}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-[18px] p-8 lg:p-10" style={{ background: "var(--tint)", border: "1px solid var(--rule)" }}>
              <p className="eyebrow" style={{ color: "var(--primary)" }}>{t.evening.usLabel}</p>
              <ol className="mt-8 space-y-6">
                {t.evening.withUs.map((step, index) => (
                  <li className="grid grid-cols-[4.5rem_1fr] gap-5" key={`${step.time}-${index}`}>
                    <span className="font-display text-lg tabular-nums" style={{ color: "var(--primary)" }}>
                      {step.time}
                    </span>
                    <span className="text-[15px] leading-7" style={{ color: "var(--ink-2)" }}>
                      {step.text}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <blockquote className="rule-top mt-16 pt-10" data-reveal>
            <p className="font-display max-w-[24ch] text-[clamp(1.5rem,3vw,2.7rem)] italic leading-[1.16]" style={{ color: "var(--ink)" }}>
              {t.evening.quote}
            </p>
          </blockquote>
        </div>
      </section>

      {/* 02 — Звонок */}
      <section id="call" style={{ background: "var(--paper)" }}>
        <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end" data-reveal>
            <div>
              <ChapterMark index="02" label={t.call.mark} />
              <h2 className="font-display mt-8 max-w-[17ch] text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.03]" style={{ color: "var(--ink)" }}>
                {t.call.title}
              </h2>
            </div>
            <p className="max-w-[42ch] text-base leading-8" style={{ color: "var(--ink-3)" }}>
              {t.call.lead}
            </p>
          </div>

          <ol className="mt-14">
            {t.call.steps.map((step, index) => (
              <li
                className="grid gap-5 py-8 md:grid-cols-[5rem_minmax(0,20ch)_1fr] md:items-baseline md:gap-10"
                data-reveal
                key={step.title}
                style={{ borderTop: "1px solid var(--rule)" }}
              >
                <span className="font-display text-3xl tabular-nums" style={{ color: "var(--primary)" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-2xl leading-tight" style={{ color: "var(--ink)" }}>{step.title}</h3>
                <p className="max-w-[62ch] text-[15px] leading-7" style={{ color: "var(--ink-3)" }}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 03 — Голос */}
      <section id="voice" style={{ background: "var(--wash)" }}>
        <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div data-reveal>
            <ChapterMark index="03" label={t.voice.mark} />
            <h2 className="font-display mt-8 max-w-[14ch] text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.03]" style={{ color: "var(--ink)" }}>
              {t.voice.titleTop}
              <span className="block italic" style={{ color: "var(--primary)" }}>
                {t.voice.titleAccent}
              </span>
            </h2>
          </div>

          <div className="mt-14 grid gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
            <div data-reveal>
              <div className="space-y-3">
                {t.voice.dialogue.map((line, index) => {
                  const assistant = line.who === "AI Dos";
                  return (
                    <div
                      className={`max-w-[86%] rounded-[16px] px-6 py-5 ${assistant ? "" : "ml-auto"}`}
                      key={index}
                      style={{
                        background: assistant ? "var(--primary)" : "var(--paper)",
                        color: assistant ? "#fff" : "var(--ink)",
                        border: assistant ? "none" : "1px solid var(--rule)",
                      }}
                    >
                      <p
                        className="eyebrow mb-2 flex items-center gap-2"
                        style={{ color: assistant ? "rgba(255,255,255,.85)" : "var(--brass)" }}
                      >
                        {line.who}
                        <span style={{ opacity: 0.6 }}>{line.lang}</span>
                      </p>
                      <p className="text-[15px] leading-7">{line.text}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-sm leading-6" style={{ color: "var(--ink-3)" }}>
                {t.voice.note}
              </p>
            </div>

            <div>
              {t.voice.features.map((note) => (
                <div className="rule-top py-8" data-reveal key={note.title}>
                  <h3 className="font-display text-2xl" style={{ color: "var(--ink)" }}>{note.title}</h3>
                  <p className="mt-3 max-w-[44ch] text-[15px] leading-7" style={{ color: "var(--ink-3)" }}>
                    {note.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 04 — Ночь */}
      <section id="night" style={{ background: "var(--paper)" }}>
        <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end" data-reveal>
            <div>
              <ChapterMark index="04" label={t.night.mark} />
              <h2 className="font-display mt-8 max-w-[15ch] text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.03]" style={{ color: "var(--ink)" }}>
                {t.night.title}
              </h2>
            </div>
            <p className="max-w-[44ch] text-base leading-8" style={{ color: "var(--ink-3)" }}>
              {t.night.lead}
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {t.night.items.map((item) => (
              <article
                className="rounded-[18px] p-8 lg:p-9"
                data-reveal
                key={item.title}
                style={{ background: "var(--wash)", border: "1px solid var(--rule)" }}
              >
                <p className="font-display text-4xl tabular-nums" style={{ color: "var(--primary)" }}>
                  {item.time}
                </p>
                <h3 className="font-display mt-8 text-2xl leading-tight" style={{ color: "var(--ink)" }}>{item.title}</h3>
                <p className="mt-4 text-[15px] leading-7" style={{ color: "var(--ink-3)" }}>
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — Границы */}
      <section id="limits" style={{ background: "var(--wash)" }}>
        <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end" data-reveal>
            <div>
              <ChapterMark index="05" label={t.limits.mark} />
              <h2 className="font-display mt-8 max-w-[16ch] text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.03]" style={{ color: "var(--ink)" }}>
                {t.limits.titleTop}
                <span className="block italic" style={{ color: "var(--primary)" }}>
                  {t.limits.titleAccent}
                </span>
              </h2>
            </div>
            <p className="max-w-[44ch] text-base leading-8" style={{ color: "var(--ink-3)" }}>
              {t.limits.lead}
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2">
            {t.limits.items.map((item) => (
              <article
                className="rounded-[18px] p-8 lg:p-9"
                data-reveal
                key={item.title}
                style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
              >
                <span aria-hidden className="block h-px w-10" style={{ background: "var(--primary)" }} />
                <h3 className="font-display mt-7 text-[1.65rem] leading-tight" style={{ color: "var(--ink)" }}>{item.title}</h3>
                <p className="mt-4 max-w-[48ch] text-[15px] leading-7" style={{ color: "var(--ink-3)" }}>
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 06 — Основание */}
      <section id="ground" style={{ background: "var(--paper)" }}>
        <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div data-reveal>
            <ChapterMark index="06" label={t.ground.mark} />
            <h2 className="font-display mt-8 max-w-[18ch] text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[1.03]" style={{ color: "var(--ink)" }}>
              {t.ground.title}
            </h2>
          </div>

          <div className="mt-12 grid gap-x-12 gap-y-2 md:grid-cols-2">
            {t.ground.items.map((item) => (
              <div className="rule-top py-8" data-reveal key={item.title}>
                <h3 className="font-display text-2xl" style={{ color: "var(--ink)" }}>{item.title}</h3>
                <p className="mt-3 max-w-[46ch] text-[15px] leading-7" style={{ color: "var(--ink-3)" }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <div
            className="mt-16 grid gap-8 rounded-[22px] p-8 lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:gap-16 lg:p-12"
            data-reveal
            style={{ background: "var(--tint)", border: "1px solid var(--rule)" }}
          >
            <div>
              <p className="eyebrow" style={{ color: "var(--brass)" }}>{t.ground.apiEyebrow}</p>
              <h3 className="font-display mt-6 max-w-[18ch] text-[clamp(1.6rem,2.8vw,2.5rem)] leading-tight" style={{ color: "var(--ink)" }}>
                {t.ground.apiTitle}
              </h3>
            </div>
            <p className="text-[15px] leading-7 lg:pb-2" style={{ color: "var(--ink-2)" }}>
              {t.ground.apiBody}
            </p>
          </div>
        </div>
      </section>

      {/* Финал — изумрудный бренд-блок со светлым кадром */}
      <section style={{ background: "var(--paper)" }}>
        <div className="mx-auto max-w-[1280px] px-5 pb-24 sm:px-8 lg:px-12 lg:pb-32">
          <div
            className="grid items-stretch gap-0 overflow-hidden rounded-[26px] lg:grid-cols-[1.1fr_.9fr]"
            data-reveal
            style={{ background: "var(--primary-deep)" }}
          >
            <div className="p-9 sm:p-12 lg:p-14">
              <h2 className="font-display max-w-[16ch] text-[clamp(2.1rem,4vw,3.6rem)] leading-[1.04] text-white">
                {t.final.titleTop}
                <span className="block italic" style={{ color: "var(--brass-lift)" }}>
                  {t.final.titleAccent}
                </span>
              </h2>
              <p className="mt-6 max-w-[40ch] text-base leading-8" style={{ color: "rgba(255,255,255,.78)" }}>
                {t.final.lead}
              </p>
              <Link
                className="mt-9 inline-flex h-14 items-center gap-2.5 rounded-full px-8 text-sm font-semibold tracking-wide transition hover:-translate-y-0.5"
                href="/register"
                style={{ background: "var(--paper)", color: "var(--primary-deep)" }}
              >
                {t.cta.create} <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="relative min-h-[280px] lg:min-h-full">
              <Image
                alt="Светлая зона ожидания клиники с растениями"
                className="object-cover object-center"
                fill
                sizes="(max-width: 1024px) 100vw, 560px"
                src="/hero/clinic-waiting.jpg"
              />
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: "var(--wash)" }}>
        <div className="rule-top mx-auto flex max-w-[1280px] flex-col gap-6 px-5 py-10 text-sm sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12" style={{ color: "var(--ink-3)" }}>
          <Brand className="font-display text-2xl" style={{ color: "var(--ink)" }} />
          <p className="max-w-[42ch] leading-6">{t.footer.disclaimer}</p>
          <div className="flex gap-6">
            <Link className="transition-colors hover:text-[var(--primary)]" href="/login">
              {t.footer.login}
            </Link>
            <Link className="transition-colors hover:text-[var(--primary)]" href="/register">
              {t.footer.register}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
