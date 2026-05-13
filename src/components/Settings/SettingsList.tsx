"use client";

import {
  listSettings,
  type SettingScope,
} from "@/lib/settings/registry";
import type { EffectiveSettings } from "@/lib/settings/resolve";
import type { ViewerRole } from "@/lib/settings/capabilities";

import SettingRow from "./SettingRow";

interface SettingsListProps {
  scope: SettingScope;
  effective: EffectiveSettings;
  viewerRole: ViewerRole;
  /** Required for `scope === "institution"`. */
  institutionId?: string;
  /** Required for `scope === "class"`. */
  classDbId?: string;
  classShortId?: string | null;
}

/**
 * Groups registry entries by `category`, sorted by `order`, and renders one
 * `SettingRow` per entry. Categories are visible only when there is more than
 * one to avoid noise on small registries.
 */
export default function SettingsList({
  scope,
  effective,
  viewerRole,
  institutionId,
  classDbId,
  classShortId,
}: SettingsListProps) {
  const definitions = listSettings(scope);
  const byCategory = new Map<string, typeof definitions>();
  for (const def of definitions) {
    const bucket = byCategory.get(def.category) ?? [];
    bucket.push(def);
    byCategory.set(def.category, bucket);
  }

  const categories = Array.from(byCategory.keys());
  const showCategoryHeaders = categories.length > 1;

  if (definitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No configurable settings at this scope yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <section key={category} className="space-y-6">
          {showCategoryHeaders && (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </h3>
          )}
          <div className="space-y-6">
            {(byCategory.get(category) ?? []).map((def) => {
              const eff = effective[def.key as keyof typeof effective];
              if (!eff) return null;
              if (scope === "institution") {
                if (!institutionId) return null;
                return (
                  <SettingRow
                    key={def.key}
                    scope="institution"
                    viewerRole={viewerRole}
                    effective={eff}
                    institutionId={institutionId}
                  />
                );
              }
              if (!classDbId) return null;
              return (
                <SettingRow
                  key={def.key}
                  scope="class"
                  viewerRole={viewerRole}
                  effective={eff}
                  classDbId={classDbId}
                  classShortId={classShortId ?? null}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
