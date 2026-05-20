import { normalizeLocaleTag } from "@/lib/locales/helpers";
import type { LocaleTag } from "@/lib/locales/types";

/** App locale → Sarvam BCP-47 (e.g. hi → hi-IN). */
const SARVAM_LANGUAGE_BY_LOCALE: Readonly<Record<string, string>> = {
  en: "en-IN",
  "en-IN": "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  od: "od-IN",
  pa: "pa-IN",
  ta: "ta-IN",
  te: "te-IN",
};

export function toSarvamLanguageCode(locale: string): string {
  const normalized = normalizeLocaleTag(locale) as LocaleTag;
  return SARVAM_LANGUAGE_BY_LOCALE[normalized] ?? `${normalized.split("-")[0]}-IN`;
}
