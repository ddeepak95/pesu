export type AiConfigSource =
  | "platform"
  | "institution"
  | "class"
  | "env"
  | "unconfigured";

export interface AiInstitutionPolicy {
  allowAdminEditProviders: boolean;
  allowAdminEditFunctions: boolean;
  /** When false, institution cannot use platform defaults; must set custom API keys. */
  allowUsePlatformDefaults: boolean;
}

export const DEFAULT_AI_INSTITUTION_POLICY: AiInstitutionPolicy = {
  allowAdminEditProviders: false,
  allowAdminEditFunctions: false,
  allowUsePlatformDefaults: true,
};

export interface AiClassOverridePolicy {
  allowChildOverrideProviders: boolean;
  allowChildOverrideFunctions: boolean;
}

export const DEFAULT_AI_CLASS_OVERRIDE_POLICY: AiClassOverridePolicy = {
  allowChildOverrideProviders: false,
  allowChildOverrideFunctions: false,
};
