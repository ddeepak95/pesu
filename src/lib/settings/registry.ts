/**
 * Settings registry — single source of truth for every hierarchical setting.
 *
 * Every UI panel and every server action reads from this file:
 *   • the resolver merges DB rows against `default`,
 *   • the capabilities helper decides who can edit / lock / override,
 *   • `SettingControl` dispatches on `type` (or renders `Control` for
 *     `type: "custom"`),
 *   • `SettingsList` groups by `category` and filters by `scopes`.
 *
 * Adding a new setting = appending one entry below. No migrations required.
 *
 * This module is safe to import from both client and server code (no
 * `server-only` here on purpose).
 */
import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type SettingScope = "institution" | "class";

export type SettingValueType =
  | "string_array"
  | "boolean"
  | "string"
  | "number"
  | "custom";

export interface SettingOption {
  value: string;
  label: string;
}

/**
 * Render-time context passed to a setting's optional `Control` component.
 * Built-in controls receive the same props so a custom control can drop in.
 */
export interface SettingControlProps<TValue> {
  value: TValue;
  onChange: (next: TValue) => void;
  disabled: boolean;
  /**
   * Parent-effective value (institution value when rendering a class control,
   * the platform default when rendering an institution control). Useful for
   * clamping the UI (e.g. greying-out options the parent excludes).
   */
  parentValue: TValue;
  definition: SettingDefinition<TValue>;
}

export interface SettingDefinition<TValue = unknown> {
  key: string;
  label: string;
  description: string;
  /** Group used by `SettingsList` to bucket the UI. */
  category: string;
  /** Sort order within `category`. Lower comes first. Defaults to 100. */
  order?: number;
  /** Scopes this setting is editable at. */
  scopes: readonly SettingScope[];
  type: SettingValueType;
  /** Platform default. Never persisted — applied when no row exists. */
  default: TValue;
  /** Available options for `string_array` and (single-select) `string` types. */
  options?: readonly SettingOption[];
  /**
   * Pure coercion / validation. Throws on values that cannot be normalized.
   * Called by `SettingControl`, server actions, and the resolver.
   */
  validate: (value: unknown) => TValue;
  /**
   * Pure clamp of a child value against its parent (e.g. drop options the
   * parent removed). Defaults to identity when unset.
   */
  clamp?: (child: TValue, parent: TValue) => TValue;
  /**
   * When set, overrides the built-in control for this setting. Combined with
   * `type: "custom"` for value types the built-in dispatcher does not cover.
   */
  Control?: ComponentType<SettingControlProps<TValue>>;
  /**
   * When true, institution_admin and super_admin may set a class override even
   * if `allow_child_override` is false; class teachers never may.
   */
  classOverrideAdminOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Built-in `validate` helpers — small, reusable, fully typed.
// ---------------------------------------------------------------------------

/** Coerce to an array of unique strings from a known option set. */
function validateStringArrayFromOptions(
  raw: unknown,
  options: readonly SettingOption[],
  { allowEmpty = false }: { allowEmpty?: boolean } = {}
): string[] {
  if (!Array.isArray(raw)) {
    throw new Error("Expected an array of strings");
  }
  const known = new Set(options.map((o) => o.value));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!known.has(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  if (!allowEmpty && out.length === 0) {
    throw new Error("At least one option must be selected");
  }
  // Preserve registry option order so two equivalent selections serialize identically.
  return options.map((o) => o.value).filter((v) => seen.has(v));
}

function validateBoolean(raw: unknown): boolean {
  if (typeof raw !== "boolean") {
    throw new Error("Expected a boolean");
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Registry entries
//
// Append new entries here. TS infers each entry's value type from `default` and
// `validate`'s return type.
// ---------------------------------------------------------------------------

export const ASSESSMENT_MODE_OPTIONS = [
  { value: "voice", label: "Voice" },
  { value: "text_chat", label: "Text chat" },
  { value: "static_text", label: "Static text" },
  { value: "multimodal", label: "Multimodal" },
] as const satisfies readonly SettingOption[];

export type AssessmentMode = (typeof ASSESSMENT_MODE_OPTIONS)[number]["value"];

const allowedAssessmentModes: SettingDefinition<AssessmentMode[]> = {
  key: "allowed_assessment_modes",
  label: "Allowed assessment modes",
  description:
    "Modes that assignments created in this scope may use. Existing assignments using a disallowed mode keep working but cannot be created.",
  category: "Assessment",
  order: 10,
  scopes: ["institution", "class"],
  type: "string_array",
  default: ASSESSMENT_MODE_OPTIONS.map((o) => o.value) as AssessmentMode[],
  options: ASSESSMENT_MODE_OPTIONS,
  validate: (raw) =>
    validateStringArrayFromOptions(raw, ASSESSMENT_MODE_OPTIONS) as AssessmentMode[],
  clamp: (child, parent) => child.filter((mode) => parent.includes(mode)),
};

const enableBulkFeedbackApproval: SettingDefinition<boolean> = {
  key: "enable_bulk_feedback_approval",
  label: "Bulk feedback approval",
  description:
    "When enabled, teachers can approve all pending AI-generated feedback for an assignment in one action, without editing each item individually.",
  category: "Assessment",
  order: 20,
  scopes: ["institution", "class"],
  type: "boolean",
  default: false,
  validate: validateBoolean,
  classOverrideAdminOnly: true,
};

/**
 * Erased definition shape — used by code that handles arbitrary registry
 * entries (resolver, UI dispatcher, server actions). Each definition's
 * concrete `TValue` is recovered at the lookup site via `getSettingDefinition`
 * when callers need it. We use `any` here (rather than `unknown`) so the
 * function-typed `validate`/`clamp` fields stay assignable from their
 * concrete-value siblings; the validators themselves are still safe because
 * each one runs against its own typed value at the lookup site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySettingDefinition = SettingDefinition<any>;

/**
 * The registry. `as const satisfies` keeps key inference precise while still
 * enforcing the `SettingDefinition` contract on every entry.
 */
export const SETTINGS_REGISTRY = {
  allowed_assessment_modes: allowedAssessmentModes,
  enable_bulk_feedback_approval: enableBulkFeedbackApproval,
} as const satisfies Record<string, AnySettingDefinition>;

export type SettingKey = keyof typeof SETTINGS_REGISTRY;

/** Strongly-typed lookup. Throws on unknown keys (registry drift). */
export function getSettingDefinition<K extends SettingKey>(
  key: K
): (typeof SETTINGS_REGISTRY)[K] {
  const def = SETTINGS_REGISTRY[key];
  if (!def) {
    throw new Error(`Unknown setting key: ${key}`);
  }
  return def;
}

/** All registry entries as an ordered list (grouped by category, then order). */
export function listSettings(scope: SettingScope): AnySettingDefinition[] {
  const entries = (
    Object.values(SETTINGS_REGISTRY) as AnySettingDefinition[]
  ).filter((def) => def.scopes.includes(scope));
  return entries.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return (a.order ?? 100) - (b.order ?? 100);
  });
}

/** Whether a key is known to the registry. Used by the resolver to skip orphaned DB rows. */
export function isKnownSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key);
}
