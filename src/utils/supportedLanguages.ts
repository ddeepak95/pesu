/**
 * @deprecated Import from `@/lib/locales` instead. This shim preserves `{ code, name }`.
 */
import { getAppLocalesLegacyShape } from "@/lib/locales/registry";

/** @deprecated Use APP_LOCALES / getAppLocalesLegacyShape from @/lib/locales */
export const supportedLanguages = getAppLocalesLegacyShape();
