/** BCP-47 locale tag (e.g. en, en-IN, zh). */
export type LocaleTag = string;

export type LocaleDefinition = {
  /** Canonical locale key used in DB, session config, and manifests. */
  locale: LocaleTag;
  /** Display name for UI and prompt interpolation. */
  label: string;
};

/** Legacy shape used across assignment UI until call sites migrate. */
export type LegacySupportedLanguage = {
  code: string;
  name: string;
};
