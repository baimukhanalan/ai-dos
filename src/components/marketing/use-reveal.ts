"use client";

import { useEffect, useRef } from "react";

/**
 * Помечает элемент классом `is-visible`, когда он въезжает в кадр, и снимает
 * при выходе, чтобы контент проявлялся при каждом проходе. Один общий
 * IntersectionObserver на всё дерево дешевле, чем слушатель скролла.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const targets = node.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("is-visible", entry.isIntersecting);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );

    targets.forEach((target) => {
      target.classList.add("reveal");
      observer.observe(target);
    });
    return () => observer.disconnect();
  }, []);

  return ref;
}
