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
  /** Default used by any class with no explicit allowChildOverride* override. */
  defaultAllowChildOverrideProviders: boolean;
  defaultAllowChildOverrideFunctions: boolean;
}

export const DEFAULT_AI_INSTITUTION_POLICY: AiInstitutionPolicy = {
  allowAdminEditProviders: false,
  allowAdminEditFunctions: false,
  allowUsePlatformDefaults: true,
  defaultAllowChildOverrideProviders: false,
  defaultAllowChildOverrideFunctions: false,
};

export interface AiClassOverridePolicy {
  /** null = inherit the institution's default_allow_child_override_*. */
  allowChildOverrideProviders: boolean | null;
  allowChildOverrideFunctions: boolean | null;
}

export const DEFAULT_AI_CLASS_OVERRIDE_POLICY: AiClassOverridePolicy = {
  allowChildOverrideProviders: null,
  allowChildOverrideFunctions: null,
};

/** Resolves a class's effective override policy against the institution's default. */
export function resolveClassOverridePolicy(
  institutionPolicy: AiInstitutionPolicy,
  classOverridePolicy: AiClassOverridePolicy,
): { allowChildOverrideProviders: boolean; allowChildOverrideFunctions: boolean } {
  return {
    allowChildOverrideProviders:
      classOverridePolicy.allowChildOverrideProviders ??
      institutionPolicy.defaultAllowChildOverrideProviders,
    allowChildOverrideFunctions:
      classOverridePolicy.allowChildOverrideFunctions ??
      institutionPolicy.defaultAllowChildOverrideFunctions,
  };
}
