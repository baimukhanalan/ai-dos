"use client";

import { useEffect, useState } from "react";

/** `tone` — фон раздела, над которым окажется рельса на широком экране. */
export type StoryChapter = {
  id: string;
  label: string;
  tone?: "light" | "dark";
};

/**
 * Оглавление истории справа. Отслеживает раздел, который сейчас в кадре, —
 * читатель всегда видит, где он находится в рассказе.
 */
export function StoryRail({ chapters }: { chapters: StoryChapter[] }) {
  const [active, setActive] = useState(chapters[0]?.id);

  useEffect(() => {
    const sections = chapters
      .map((chapter) => document.getElementById(chapter.id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [chapters]);

  const onDark =
    chapters.find((chapter) => chapter.id === active)?.tone === "dark";
  const idle = onDark ? "rgba(241,237,226,.42)" : "rgba(10,21,18,.38)";
  const idleRule = onDark ? "rgba(241,237,226,.3)" : "rgba(10,21,18,.28)";
  const accent = onDark ? "var(--brass-lift)" : "var(--brass)";

  return (
    <nav
      aria-label="Разделы истории"
      /**
       * Показываем оглавление только когда поле у контейнера шире самой
       * рельсы: на 1440px она наезжала на правую колонку разделов.
       */
      className="pointer-events-none fixed right-8 top-1/2 z-40 hidden -translate-y-1/2 min-[1680px]:block"
    >
      <ol className="flex flex-col items-end gap-3.5">
        {chapters.map((chapter, index) => {
          const current = chapter.id === active;
          return (
            <li key={chapter.id}>
              <a
                className="pointer-events-auto group flex items-center justify-end gap-2.5 text-[11px] tracking-[0.14em] uppercase transition-colors"
                href={`#${chapter.id}`}
                style={{
                  color: current ? accent : idle,
                  fontWeight: current ? 600 : 500,
                }}
              >
                <span className="tabular-nums opacity-60">
                  {String(index).padStart(2, "0")}
                </span>
                <span
                  className="transition-opacity"
                  style={{ opacity: current ? 1 : 0.75 }}
                >
                  {chapter.label}
                </span>
                <span
                  aria-hidden
                  className="h-px transition-all"
                  style={{
                    width: current ? 26 : 12,
                    backgroundColor: current ? accent : idleRule,
                  }}
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
