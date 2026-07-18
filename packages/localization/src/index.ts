import en from "./messages/en.json";
import ar from "./messages/ar.json";
import ku from "./messages/ku.json";

export type Locale = "en" | "ar" | "ku";
export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Locale, Record<string, string>> = { en, ar, ku };
export const RTL_LOCALES: Locale[] = ["ar", "ku"];
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  ku: "کوردی سۆرانی",
};

export function t(locale: Locale, key: string): string {
  return MESSAGES[locale]?.[key] ?? MESSAGES.en[key] ?? key;
}

export function dirFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}
