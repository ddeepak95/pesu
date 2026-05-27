import { getKonvoEnabledLocales } from "./konvoLocaleCapabilitiesHelpers";

/** Locales enabled for Konvo voice (subset of APP_LOCALES). */
export const KONVO_PROTOTYPE_LANGUAGE_CODES = getKonvoEnabledLocales();

export type KonvoPrototypeLanguageCode =
  (typeof KONVO_PROTOTYPE_LANGUAGE_CODES)[number];
