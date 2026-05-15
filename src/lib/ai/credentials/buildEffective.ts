/**
 * Pure merge of platform / institution / class AI config rows into UI bundles.
 */
import {
  AI_CAPABILITY_REGISTRY,
  TEXT_CAPABILITY_KEY,
  type AiCapabilityKey,
  isAiCapabilityKey,
} from "@/lib/ai/capabilities/registry";
import {
  AI_CONFIG_LOCKS_KEY,
  isAiConfigLocksKey,
} from "@/lib/ai/credentials/constants";
import type {
  AiCapabilityConfigMetaRow,
  AiInstitutionPolicy,
  EffectiveAiConfigs,
  EffectiveAiCapabilityMeta,
} from "@/types/aiCapabilityConfig";

const DEFAULT_POLICY: AiInstitutionPolicy = {
  allowAdminEdit: false,
  allowChildOverride: false,
  allowUsePlatformDefaults: true,
};

function indexCapabilityRows(
  rows: AiCapabilityConfigMetaRow[],
): Map<string, AiCapabilityConfigMetaRow> {
  const out = new Map<string, AiCapabilityConfigMetaRow>();
  for (const row of rows) {
    if (isAiConfigLocksKey(row.capability_key)) continue;
    if (!isAiCapabilityKey(row.capability_key)) continue;
    out.set(row.capability_key, row);
  }
  return out;
}

export function readInstitutionPolicy(
  instRows: AiCapabilityConfigMetaRow[],
): AiInstitutionPolicy {
  const locksRow = instRows.find((r) => r.capability_key === AI_CONFIG_LOCKS_KEY);
  if (!locksRow) return DEFAULT_POLICY;
  return {
    allowAdminEdit: locksRow.allow_admin_edit,
    allowChildOverride: locksRow.allow_child_override,
    allowUsePlatformDefaults: locksRow.allow_use_platform_defaults ?? true,
  };
}

function metaFromRow(
  row: AiCapabilityConfigMetaRow,
  source: EffectiveAiCapabilityMeta["source"],
  opts: {
    usePlatformDefault: boolean;
    hasClassOverride: boolean;
  },
): EffectiveAiCapabilityMeta {
  const hasKey = Boolean(row.key_hint);
  return {
    capabilityKey: row.capability_key as AiCapabilityKey,
    source,
    usePlatformDefault: opts.usePlatformDefault,
    hasClassOverride: opts.hasClassOverride,
    provider: row.provider,
    modelId: row.model_id,
    keyHint: row.key_hint,
    hasKey,
  };
}

function envFallbackMeta(
  capabilityKey: AiCapabilityKey,
): EffectiveAiCapabilityMeta {
  return {
    capabilityKey,
    source: "env",
    usePlatformDefault: true,
    hasClassOverride: false,
    provider: null,
    modelId: null,
    keyHint: null,
    hasKey: false,
  };
}

function unconfiguredMeta(
  capabilityKey: AiCapabilityKey,
): EffectiveAiCapabilityMeta {
  return {
    capabilityKey,
    source: "unconfigured",
    usePlatformDefault: false,
    hasClassOverride: false,
    provider: null,
    modelId: null,
    keyHint: null,
    hasKey: false,
  };
}

function platformMetaFromRow(
  row: AiCapabilityConfigMetaRow | undefined,
  capabilityKey: AiCapabilityKey,
): EffectiveAiCapabilityMeta {
  if (!row || row.use_platform_default) {
    return envFallbackMeta(capabilityKey);
  }
  return metaFromRow(row, "platform", {
    usePlatformDefault: false,
    hasClassOverride: false,
  });
}

function institutionMetaForCapability(
  capabilityKey: AiCapabilityKey,
  platformRow: AiCapabilityConfigMetaRow | undefined,
  instRow: AiCapabilityConfigMetaRow | undefined,
  policy: AiInstitutionPolicy,
): EffectiveAiCapabilityMeta {
  if (instRow && !instRow.use_platform_default) {
    return metaFromRow(instRow, "institution", {
      usePlatformDefault: false,
      hasClassOverride: false,
    });
  }
  if (!policy.allowUsePlatformDefaults) {
    return unconfiguredMeta(capabilityKey);
  }
  const platformMeta = platformMetaFromRow(platformRow, capabilityKey);
  return {
    ...platformMeta,
    usePlatformDefault: true,
    source: platformMeta.source === "env" ? "env" : "platform",
  };
}

function classMetaForCapability(
  capabilityKey: AiCapabilityKey,
  platformRow: AiCapabilityConfigMetaRow | undefined,
  instRow: AiCapabilityConfigMetaRow | undefined,
  classRow: AiCapabilityConfigMetaRow | undefined,
  policy: AiInstitutionPolicy,
): EffectiveAiCapabilityMeta {
  if (classRow && !classRow.use_platform_default) {
    return metaFromRow(classRow, "class", {
      usePlatformDefault: false,
      hasClassOverride: true,
    });
  }
  const instMeta = institutionMetaForCapability(
    capabilityKey,
    platformRow,
    instRow,
    policy,
  );
  return {
    ...instMeta,
    hasClassOverride: false,
  };
}

function buildCapabilities(
  platformRows: AiCapabilityConfigMetaRow[],
  institutionRows: AiCapabilityConfigMetaRow[],
  classRows: AiCapabilityConfigMetaRow[],
  policy: AiInstitutionPolicy,
  scope: "platform" | "institution" | "class",
): Record<AiCapabilityKey, EffectiveAiCapabilityMeta> {
  const platformByKey = indexCapabilityRows(platformRows);
  const instByKey = indexCapabilityRows(institutionRows);
  const classByKey = indexCapabilityRows(classRows);
  const capabilities = {} as Record<AiCapabilityKey, EffectiveAiCapabilityMeta>;

  for (const key of Object.keys(AI_CAPABILITY_REGISTRY) as AiCapabilityKey[]) {
    if (scope === "platform") {
      capabilities[key] = platformMetaFromRow(platformByKey.get(key), key);
    } else if (scope === "institution") {
      capabilities[key] = institutionMetaForCapability(
        key,
        platformByKey.get(key),
        instByKey.get(key),
        policy,
      );
    } else {
      capabilities[key] = classMetaForCapability(
        key,
        platformByKey.get(key),
        instByKey.get(key),
        classByKey.get(key),
        policy,
      );
    }
  }
  return capabilities;
}

export function buildPlatformAiConfigs(
  platformRows: AiCapabilityConfigMetaRow[],
): EffectiveAiConfigs {
  return {
    capabilities: buildCapabilities(platformRows, [], [], DEFAULT_POLICY, "platform"),
    institutionPolicy: DEFAULT_POLICY,
  };
}

export function buildInstitutionAiConfigs(
  platformRows: AiCapabilityConfigMetaRow[],
  institutionRows: AiCapabilityConfigMetaRow[],
): EffectiveAiConfigs {
  const policy = readInstitutionPolicy(institutionRows);
  return {
    capabilities: buildCapabilities(
      platformRows,
      institutionRows,
      [],
      policy,
      "institution",
    ),
    institutionPolicy: policy,
  };
}

export function buildClassAiConfigs(
  platformRows: AiCapabilityConfigMetaRow[],
  institutionRows: AiCapabilityConfigMetaRow[],
  classRows: AiCapabilityConfigMetaRow[],
): EffectiveAiConfigs {
  const policy = readInstitutionPolicy(institutionRows);
  return {
    capabilities: buildCapabilities(
      platformRows,
      institutionRows,
      classRows,
      policy,
      "class",
    ),
    institutionPolicy: policy,
  };
}

export { TEXT_CAPABILITY_KEY };
