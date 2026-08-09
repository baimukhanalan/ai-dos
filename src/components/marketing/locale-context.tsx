"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  dictionaries,
  isLocale,
  type Dictionary,
  type Locale,
} from "@/components/marketing/i18n";

type LocaleState = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Dictionary;
};

const LocaleContext = createContext<LocaleState | null>(null);
const storageKey = "aidos.landing.locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  // Восстанавливаем выбор при монтировании: сохранённый язык, затем язык
  // браузера, иначе RU. Читаем в эффекте (а не в инициализаторе useState),
  // чтобы серверный и клиентский рендер совпали — иначе гидрация разъедется.
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const nav = window.navigator.language.slice(0, 2).toLowerCase();
    const next = saved && isLocale(saved) ? saved : isLocale(nav) ? nav : null;
    if (next && next !== "ru") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- восстановление сохранённой настройки после монтирования
      setLocaleState(next);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(storageKey, next);
    document.documentElement.lang = next;
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: dictionaries[locale] }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
