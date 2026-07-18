"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { dirFor, LOCALE_NAMES, MESSAGES, type Locale } from "@leen-life/localization";

interface I18n {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: (key: string) => string;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18n>({
  locale: "en",
  dir: "ltr",
  t: (k) => MESSAGES.en[k] ?? k,
  setLocale: () => {},
});

export function readLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|; )locale=(\w+)/);
  const l = m?.[1] as Locale | undefined;
  return l && ["en", "ar", "ku"].includes(l) ? l : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    setLocaleState(readLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirFor(locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
    setLocaleState(l);
  }, []);

  const t = useCallback((key: string) => MESSAGES[locale]?.[key] ?? MESSAGES.en[key] ?? key, [locale]);

  return (
    <I18nContext.Provider value={{ locale, dir: dirFor(locale), t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
export { LOCALE_NAMES };
