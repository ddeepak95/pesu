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
 * Declares that a setting is owned per-institution: when an institution is
 * created (and via the idempotent backfill for existing ones), a
 * `setting_values` row is seeded at the institution scope with these locks so
 * institution admins can manage their own default from day one — instead of
 * relying on the registry `default` alone.
 *
 * Setting the lock columns at seed time (through the super-admin-gated create
 * path) is deliberate: a bare materialized row defaults both locks to `false`
 * at the DB level, which would lock institution admins out of edits and block
 * class overrides. See `src/lib/settings/scaffold.ts`.
 */
export interface InstitutionScaffold<TValue> {
  /** Seeded institution value. Defaults to the registry `default` when omitted. */
  value?: TValue;
  /** Institution admins may edit the institution value. */
  allowAdminEdit: boolean;
  /** Classes may override (class admins bypass via `classOverrideAdminOnly`). */
  allowChildOverride: boolean;
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
  /**
   * When set, this setting is seeded as an institution-owned row on institution
   * creation (and via the backfill). See `InstitutionScaffold`.
   */
  institutionScaffold?: InstitutionScaffold<TValue>;
}

// ---------------------------------------------------------------------------
// Built-in `validate` helpers — small, reusable, fully typed.
// ---------------------------------------------------------------------------

function validateBoolean(raw: unknown): boolean {
  if (typeof raw !== "boolean") {
    throw new Error("Expected a boolean");
  }
  return raw;
}

/**
 * Factory for a `string_array` validator bound to a fixed option set. The
 * returned validator whitelists to known option values, de-duplicates, and
 * returns them in option order (so persisted values are canonical). Unknown
 * values are dropped rather than throwing, which keeps the resolver resilient
 * to registry option changes over time.
 */
function makeStringArrayValidator(
  options: readonly SettingOption[]
): (raw: unknown) => string[] {
  const order = options.map((o) => o.value);
  const allowed = new Set(order);
  return (raw: unknown): string[] => {
    if (!Array.isArray(raw)) {
      throw new Error("Expected an array of strings");
    }
    const present = new Set<string>();
    for (const v of raw) {
      if (typeof v !== "string") {
        throw new Error("Expected string values");
      }
      if (allowed.has(v)) present.add(v);
    }
    return order.filter((v) => present.has(v));
  };
}

// ---------------------------------------------------------------------------
// Registry entries
//
// Append new entries here. TS infers each entry's value type from `default` and
// `validate`'s return type.
// ---------------------------------------------------------------------------

export const ASSESSMENT_MODE_OPTIONS = [
  { value: "voice", label: "Voice" },
  { value: "static_text", label: "Static text" },
  { value: "multimodal", label: "Multimodal" },
] as const satisfies readonly SettingOption[];

export type AssessmentMode = (typeof ASSESSMENT_MODE_OPTIONS)[number]["value"];

/** Interaction types kept for existing assignments but no longer creatable. */
export const RETIRED_ASSESSMENT_MODES = new Set<AssessmentMode>(["voice"]);

/**
 * The four creatable content types, keyed by the ids used throughout
 * `content_items.type` and the create routes. Single source of truth for the
 * `allowed_content_types` option set and for mapping a type to its create-route
 * URL segment.
 */
export const CONTENT_TYPE_OPTIONS = [
  { value: "formative_assignment", label: "Activity" },
  { value: "learning_content", label: "Content" },
  { value: "quiz", label: "Quiz" },
  { value: "survey", label: "Survey" },
] as const satisfies readonly SettingOption[];

export type ContentTypeId = (typeof CONTENT_TYPE_OPTIONS)[number]["value"];

/** Content type id → create-route URL segment (`/teacher/classes/:id/<segment>/create`). */
export const CONTENT_TYPE_SEGMENTS: Record<ContentTypeId, string> = {
  formative_assignment: "assignments",
  learning_content: "learning-content",
  quiz: "quizzes",
  survey: "surveys",
};

const allowedContentTypes: SettingDefinition<string[]> = {
  key: "allowed_content_types",
  label: "Allowed content types",
  description:
    "Content types teachers can create in a class. Quiz and Survey are off by default.",
  category: "Content",
  order: 10,
  scopes: ["institution", "class"],
  type: "string_array",
  options: CONTENT_TYPE_OPTIONS,
  // Quiz & Survey off by default.
  default: ["formative_assignment", "learning_content"],
  validate: makeStringArrayValidator(CONTENT_TYPE_OPTIONS),
  // A class can never re-enable a type the institution turned off.
  clamp: (child, parent) => child.filter((v) => parent.includes(v)),
  classOverrideAdminOnly: true,
  institutionScaffold: { allowAdminEdit: true, allowChildOverride: true },
};

const showStudentsAnalyticsTab: SettingDefinition<boolean> = {
  key: "show_students_analytics_tab",
  label: "Show Students → Analytics tab",
  description:
    "When on, the Analytics sub-tab is available inside a class's Students tab.",
  category: "Views",
  order: 10,
  scopes: ["institution", "class"],
  type: "boolean",
  default: false, // hidden by default
  validate: validateBoolean,
  classOverrideAdminOnly: true,
  institutionScaffold: { allowAdminEdit: true, allowChildOverride: true },
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
  allowed_content_types: allowedContentTypes,
  show_students_analytics_tab: showStudentsAnalyticsTab,
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
