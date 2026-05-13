"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  invalidateSettingsCache,
} from "@/hooks/swr/useSettings";
import {
  clearClassSettingOverrideAction,
  setInstitutionSettingLockAction,
  upsertClassSettingOverrideAction,
  upsertInstitutionSettingAction,
} from "@/lib/settings/actions";
import {
  settingCapabilities,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import {
  type AnySettingDefinition,
  getSettingDefinition,
} from "@/lib/settings/registry";
import type { EffectiveSetting } from "@/lib/settings/resolve";

import SettingControl from "./SettingControl";

interface CommonProps {
  viewerRole: ViewerRole;
  effective: EffectiveSetting;
}

interface InstitutionRowProps extends CommonProps {
  scope: "institution";
  institutionId: string;
}

interface ClassRowProps extends CommonProps {
  scope: "class";
  classDbId: string;
  classShortId: string | null;
}

type SettingRowProps = InstitutionRowProps | ClassRowProps;

export default function SettingRow(props: SettingRowProps) {
  if (props.scope === "institution") {
    return <InstitutionSettingRow {...props} />;
  }
  return <ClassSettingRow {...props} />;
}

// ---------------------------------------------------------------------------
// Institution-level row
// ---------------------------------------------------------------------------

function InstitutionSettingRow({
  viewerRole,
  effective,
  institutionId,
}: InstitutionRowProps) {
  const def = getSettingDefinition(effective.key) as AnySettingDefinition;
  const caps = settingCapabilities({
    viewerRole,
    definition: def,
    institutionLocks: effective.institutionLocks,
  });

  // Use the platform default as the "parent" for clamping at the institution
  // level — for now there's no super-scope, but this keeps the contract
  // symmetric with class-level controls.
  const parentValue = def.default;

  const [draft, setDraft] = useState<unknown>(effective.value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(effective.value);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await upsertInstitutionSettingAction({
        institutionId,
        key: def.key,
        value: draft,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save");
        return;
      }
      invalidateSettingsCache();
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    });
  };

  const handleLockToggle = (
    lock: "allow_admin_edit" | "allow_child_override",
    next: boolean
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await setInstitutionSettingLockAction({
        institutionId,
        key: def.key,
        lock,
        enabled: next,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save lock");
        return;
      }
      invalidateSettingsCache();
    });
  };

  return (
    <SettingRowShell definition={def} sourceLabel={sourceLabel(effective)}>
      <SettingControl
        value={draft}
        onChange={setDraft}
        parentValue={parentValue}
        disabled={!caps.canEditInstitutionValue || pending}
        definition={def}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <LockToggle
          id={`${def.key}-allow-admin-edit`}
          label="Allow institution admin to override"
          tooltip="When off, only platform super admins may override the platform default."
          checked={effective.institutionLocks.allowAdminEdit}
          disabled={!caps.canToggleAllowAdminEdit || pending}
          onChange={(next) => handleLockToggle("allow_admin_edit", next)}
        />
        <LockToggle
          id={`${def.key}-allow-child-override`}
          label="Allow class admin to override"
          tooltip="When off, class admins cannot override the institution value."
          checked={effective.institutionLocks.allowChildOverride}
          disabled={!caps.canToggleAllowChildOverride || pending}
          onChange={(next) => handleLockToggle("allow_child_override", next)}
        />
      </div>

      <RowFooter
        canSave={caps.canEditInstitutionValue}
        hasChanges={hasChanges}
        pending={pending}
        savedAt={savedAt}
        error={error}
        onSave={handleSave}
      />
    </SettingRowShell>
  );
}

// ---------------------------------------------------------------------------
// Class-level row
// ---------------------------------------------------------------------------

function ClassSettingRow({
  viewerRole,
  effective,
  classDbId,
  classShortId,
}: ClassRowProps) {
  const def = getSettingDefinition(effective.key) as AnySettingDefinition;
  const caps = settingCapabilities({
    viewerRole,
    definition: def,
    institutionLocks: effective.institutionLocks,
  });

  const inheritedValue = effective.institutionValue;
  const [overrideEnabled, setOverrideEnabled] = useState(
    effective.hasClassOverride
  );
  const [draft, setDraft] = useState<unknown>(effective.value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const hasChanges =
    overrideEnabled !== effective.hasClassOverride ||
    (overrideEnabled &&
      JSON.stringify(draft) !== JSON.stringify(effective.value));

  const handleToggleOverride = (next: boolean) => {
    setError(null);
    setOverrideEnabled(next);
    if (next && !effective.hasClassOverride) {
      // Start the override from the inherited value.
      setDraft(inheritedValue);
    }
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = overrideEnabled
        ? await upsertClassSettingOverrideAction({
            classDbId,
            classShortId,
            key: def.key,
            value: draft,
          })
        : await clearClassSettingOverrideAction({
            classDbId,
            classShortId,
            key: def.key,
          });
      if (!result.ok) {
        setError(result.error ?? "Failed to save");
        return;
      }
      invalidateSettingsCache();
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    });
  };

  const overridingDisabled =
    !caps.canEditClassOverride && !caps.canClearClassOverride;

  return (
    <SettingRowShell definition={def} sourceLabel={sourceLabel(effective)}>
      {!effective.institutionLocks.allowChildOverride && (
        <p className="text-xs text-muted-foreground mb-3">
          Locked by the institution. Inherited value is shown read-only.
        </p>
      )}

      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-sm text-muted-foreground">
          Inherited: <ValuePreview value={inheritedValue} definition={def} />
        </div>
        <LockToggle
          id={`${def.key}-override`}
          label="Override for this class"
          checked={overrideEnabled}
          disabled={overridingDisabled || pending}
          onChange={handleToggleOverride}
        />
      </div>

      {overrideEnabled && (
        <SettingControl
          value={draft}
          onChange={setDraft}
          parentValue={inheritedValue}
          disabled={!caps.canEditClassOverride || pending}
          definition={def}
        />
      )}

      <RowFooter
        canSave={!overridingDisabled}
        hasChanges={hasChanges}
        pending={pending}
        savedAt={savedAt}
        error={error}
        onSave={handleSave}
      />
    </SettingRowShell>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function SettingRowShell({
  definition,
  sourceLabel,
  children,
}: {
  definition: AnySettingDefinition;
  sourceLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <Label className="text-base">{definition.label}</Label>
          <p className="text-sm text-muted-foreground mt-1">
            {definition.description}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground whitespace-nowrap">
          {sourceLabel}
        </span>
      </div>
      {children}
    </div>
  );
}

function LockToggle({
  id,
  label,
  tooltip,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  tooltip?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2"
      title={tooltip}
    >
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}

function RowFooter({
  canSave,
  hasChanges,
  pending,
  savedAt,
  error,
  onSave,
}: {
  canSave: boolean;
  hasChanges: boolean;
  pending: boolean;
  savedAt: number | null;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-3">
      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
      {savedAt && !error && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          Saved
        </span>
      )}
      {canSave && (
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!hasChanges || pending}
        >
          {pending ? "Saving..." : "Save"}
        </Button>
      )}
    </div>
  );
}

function ValuePreview({
  value,
  definition,
}: {
  value: unknown;
  definition: AnySettingDefinition;
}) {
  if (definition.type === "string_array" && Array.isArray(value)) {
    const labels = (value as string[]).map((v) => {
      const opt = definition.options?.find((o) => o.value === v);
      return opt?.label ?? v;
    });
    return (
      <span className="text-foreground">
        {labels.length > 0 ? labels.join(", ") : "(none)"}
      </span>
    );
  }
  if (definition.type === "boolean") {
    return <span className="text-foreground">{value ? "on" : "off"}</span>;
  }
  return <span className="text-foreground">{String(value)}</span>;
}

function sourceLabel(effective: EffectiveSetting): string {
  if (effective.source === "class") return "class override";
  if (effective.source === "institution") return "institution";
  return "platform default";
}
