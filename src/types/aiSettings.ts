export type AiConfigSource =
  | "platform"
  | "institution"
  | "class"
  | "env"
  | "unconfigured";

export interface AiInstitutionPolicy {
  allowAdminEdit: boolean;
  allowChildOverride: boolean;
  /** When false, institution cannot use platform defaults; must set custom API keys. */
  allowUsePlatformDefaults: boolean;
}

export const DEFAULT_AI_INSTITUTION_POLICY: AiInstitutionPolicy = {
  allowAdminEdit: false,
  allowChildOverride: false,
  allowUsePlatformDefaults: true,
};
