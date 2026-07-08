export type AiConfigSource =
  | "platform"
  | "institution"
  | "class"
  | "env"
  | "unconfigured";

export interface AiInstitutionPolicy {
  allowAdminEdit: boolean;
  /** When false, institution cannot use platform defaults; must set custom API keys. */
  allowUsePlatformDefaults: boolean;
}

export const DEFAULT_AI_INSTITUTION_POLICY: AiInstitutionPolicy = {
  allowAdminEdit: false,
  allowUsePlatformDefaults: true,
};

export interface AiClassOverridePolicy {
  allowChildOverride: boolean;
}

export const DEFAULT_AI_CLASS_OVERRIDE_POLICY: AiClassOverridePolicy = {
  allowChildOverride: false,
};
