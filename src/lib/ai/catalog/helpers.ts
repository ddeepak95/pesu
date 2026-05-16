import {
  CATALOG_FUNCTIONS,
  CATALOG_MODELS,
  CATALOG_PROVIDERS,
  GOOGLE_THINKING_LEVEL_OPTIONS,
  MODEL_CLASS_LABEL,
  MODEL_CLASS_ORDER,
  OPENAI_REASONING_EFFORT_OPTIONS,
} from "./data";
import type {
  AiSettingsScope,
  AppSubFunctionCatalogEntry,
  CatalogBrowseMode,
  CatalogModelStatus,
  FunctionBindingState,
  GoogleThinkingLevel,
  LocalAiSettingsState,
  ModelCatalogEntry,
  ModelClass,
  ModelReasoningCapabilities,
  ModelTask,
  Modality,
  OpenAiReasoningEffort,
  ProviderId,
  SavedModelReasoningConfig,
} from "./types";

export function getProviderEntry(providerId: ProviderId) {
  return CATALOG_PROVIDERS.find((p) => p.id === providerId);
}

export function getModelEntry(modelId: string) {
  return CATALOG_MODELS.find((m) => m.id === modelId);
}

export function isFoundationModel(modelId: string): boolean {
  return getModelEntry(modelId)?.modelClass === "foundation";
}

export function getModelReasoningCapabilities(
  modelId: string,
): ModelReasoningCapabilities | undefined {
  return getModelEntry(modelId)?.reasoningCapabilities;
}

export function modelHasReasoningConfig(modelId: string): boolean {
  const caps = getModelReasoningCapabilities(modelId);
  if (!caps) return false;
  if (caps.kind === "google") return caps.levels.length > 0;
  return caps.efforts.length > 0;
}

function pickGoogleLevel(
  available: GoogleThinkingLevel[],
  preferred?: GoogleThinkingLevel,
): GoogleThinkingLevel {
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] ?? "minimal";
}

function defaultOpenAiEffort(
  available: OpenAiReasoningEffort[],
): OpenAiReasoningEffort {
  if (available.includes("none")) return "none";
  return available[0] ?? "low";
}

function pickOpenAiEffort(
  available: OpenAiReasoningEffort[],
  preferred?: OpenAiReasoningEffort,
): OpenAiReasoningEffort {
  if (preferred && available.includes(preferred)) return preferred;
  return defaultOpenAiEffort(available);
}

export function createDefaultReasoningForModel(
  modelId: string,
): SavedModelReasoningConfig | undefined {
  const caps = getModelReasoningCapabilities(modelId);
  if (!caps) return undefined;
  if (caps.kind === "google") {
    return {
      kind: "google",
      availableLevels: [...caps.levels],
      thinkingLevel: pickGoogleLevel(caps.levels, "minimal"),
    };
  }
  return {
    kind: "openai",
    availableEfforts: [...caps.efforts],
    reasoningEffort: pickOpenAiEffort(caps.efforts, defaultOpenAiEffort(caps.efforts)),
  };
}

export function coerceReasoningForModel(
  modelId: string,
  existing?: SavedModelReasoningConfig,
): SavedModelReasoningConfig | undefined {
  const caps = getModelReasoningCapabilities(modelId);
  if (!caps) return undefined;

  if (caps.kind === "google") {
    const preferred =
      existing?.kind === "google" ? existing.thinkingLevel : undefined;
    return {
      kind: "google",
      availableLevels: [...caps.levels],
      thinkingLevel: pickGoogleLevel(caps.levels, preferred),
    };
  }

  const preferred =
    existing?.kind === "openai" ? existing.reasoningEffort : undefined;
  return {
    kind: "openai",
    availableEfforts: [...caps.efforts],
    reasoningEffort: pickOpenAiEffort(caps.efforts, preferred),
  };
}

type LegacyBinding = FunctionBindingState & {
  googleThinkingLevel?: GoogleThinkingLevel;
  openaiReasoningEffort?: OpenAiReasoningEffort;
};

function migrateLegacyReasoning(binding: LegacyBinding): FunctionBindingState {
  if (binding.reasoning) {
    const { googleThinkingLevel: _g, openaiReasoningEffort: _o, ...rest } = binding;
    return rest;
  }
  const caps = getModelReasoningCapabilities(binding.modelId);
  if (!caps) {
    const { googleThinkingLevel: _g, openaiReasoningEffort: _o, ...rest } = binding;
    return rest;
  }
  if (caps.kind === "google" && binding.googleThinkingLevel) {
    return {
      providerId: binding.providerId,
      modelId: binding.modelId,
      reasoning: {
        kind: "google",
        availableLevels: [...caps.levels],
        thinkingLevel: pickGoogleLevel(caps.levels, binding.googleThinkingLevel),
      },
    };
  }
  if (caps.kind === "openai" && binding.openaiReasoningEffort) {
    return {
      providerId: binding.providerId,
      modelId: binding.modelId,
      reasoning: {
        kind: "openai",
        availableEfforts: [...caps.efforts],
        reasoningEffort: pickOpenAiEffort(caps.efforts, binding.openaiReasoningEffort),
      },
    };
  }
  const { googleThinkingLevel: _g, openaiReasoningEffort: _o, ...rest } = binding;
  return rest;
}

export function normalizeFunctionBinding(
  binding: FunctionBindingState,
): FunctionBindingState {
  const migrated = migrateLegacyReasoning(binding as LegacyBinding);
  const { providerId, modelId } = migrated;
  if (!modelId) {
    return { providerId, modelId: "" };
  }
  const model = getModelEntry(modelId);
  if (!model || model.providerId !== providerId) {
    return { providerId, modelId };
  }

  if (!modelHasReasoningConfig(modelId)) {
    return { providerId, modelId };
  }

  return {
    providerId,
    modelId,
    reasoning: coerceReasoningForModel(modelId, migrated.reasoning),
  };
}

export function formatReasoningLabel(binding: FunctionBindingState): string | null {
  const reasoning = binding.reasoning;
  if (!reasoning) return null;
  if (reasoning.kind === "google") {
    const opt = GOOGLE_THINKING_LEVEL_OPTIONS.find(
      (o) => o.value === reasoning.thinkingLevel,
    );
    return opt?.label ?? reasoning.thinkingLevel;
  }
  const opt = OPENAI_REASONING_EFFORT_OPTIONS.find(
    (o) => o.value === reasoning.reasoningEffort,
  );
  return opt?.label ?? reasoning.reasoningEffort;
}

export function formatModelReasoningCapabilities(model: ModelCatalogEntry): string {
  const caps = model.reasoningCapabilities;
  if (!caps) return "—";
  if (caps.kind === "google") {
    return caps.levels
      .map(
        (l) =>
          GOOGLE_THINKING_LEVEL_OPTIONS.find((o) => o.value === l)?.label ?? l,
      )
      .join(", ");
  }
  return caps.efforts
    .map(
      (e) =>
        OPENAI_REASONING_EFFORT_OPTIONS.find((o) => o.value === e)?.label ?? e,
    )
    .join(", ");
}

export function getReasoningOptionsForBinding(
  binding: FunctionBindingState,
): SavedModelReasoningConfig | undefined {
  if (!binding.reasoning) return undefined;
  const caps = getModelReasoningCapabilities(binding.modelId);
  if (!caps) return undefined;

  if (binding.reasoning.kind === "google" && caps.kind === "google") {
    const levels = binding.reasoning.availableLevels.filter((l) =>
      caps.levels.includes(l),
    );
    const availableLevels = levels.length > 0 ? levels : [...caps.levels];
    return {
      kind: "google",
      availableLevels,
      thinkingLevel: pickGoogleLevel(
        availableLevels,
        binding.reasoning.thinkingLevel,
      ),
    };
  }

  if (binding.reasoning.kind === "openai" && caps.kind === "openai") {
    const efforts = binding.reasoning.availableEfforts.filter((e) =>
      caps.efforts.includes(e),
    );
    const availableEfforts = efforts.length > 0 ? efforts : [...caps.efforts];
    return {
      kind: "openai",
      availableEfforts,
      reasoningEffort: pickOpenAiEffort(
        availableEfforts,
        binding.reasoning.reasoningEffort,
      ),
    };
  }

  return binding.reasoning;
}

export function getFunctionCatalogEntry(fnKey: string) {
  return CATALOG_FUNCTIONS.find((f) => f.key === fnKey);
}

export function subFunctionBindingKey(parentKey: string, subKey: string) {
  return `${parentKey}.${subKey}`;
}

export function getSubFunctionCatalog(
  parentKey: string,
  subKey: string,
): AppSubFunctionCatalogEntry | undefined {
  return getFunctionCatalogEntry(parentKey)?.subFunctions?.find(
    (s) => s.key === subKey,
  );
}

export function hasFunctionBindingOverride(
  state: LocalAiSettingsState,
  bindingKey: string,
): boolean {
  return bindingKey in state.functions;
}

export function institutionUsesPlatformFunctionDefault(
  institution: LocalAiSettingsState,
  parentKey: string,
): boolean {
  return !hasFunctionBindingOverride(institution, parentKey);
}

export function mergeInstitutionProviderStateForCatalog(
  institution: LocalAiSettingsState,
  platform: LocalAiSettingsState,
): LocalAiSettingsState {
  const providers = { ...institution.providers };
  for (const provider of CATALOG_PROVIDERS) {
    const inst = institution.providers[provider.id];
    if (inst?.usePlatformDefault) {
      providers[provider.id] = {
        ...platform.providers[provider.id],
        usePlatformDefault: true,
      };
    }
  }
  return { providers, functions: institution.functions };
}

export function resolveInstitutionEffectiveFunctionBinding(
  institution: LocalAiSettingsState,
  platform: LocalAiSettingsState,
  parentKey: string,
  subKey?: string,
): FunctionBindingState | undefined {
  if (subKey) {
    const subBindingKey = subFunctionBindingKey(parentKey, subKey);
    if (hasFunctionBindingOverride(institution, subBindingKey)) {
      return institution.functions[subBindingKey];
    }
  }
  if (hasFunctionBindingOverride(institution, parentKey)) {
    return resolveFunctionBinding(institution, parentKey, subKey);
  }
  return resolveFunctionBinding(platform, parentKey, subKey);
}

export function mergeClassProviderStateForCatalog(
  classState: LocalAiSettingsState,
  institution: LocalAiSettingsState,
  platform: LocalAiSettingsState,
): LocalAiSettingsState {
  const instMerged = mergeInstitutionProviderStateForCatalog(
    institution,
    platform,
  );
  const providers = { ...classState.providers };
  for (const provider of CATALOG_PROVIDERS) {
    const cls = classState.providers[provider.id];
    if (cls?.usePlatformDefault) {
      providers[provider.id] = {
        ...instMerged.providers[provider.id],
        usePlatformDefault: true,
      };
    }
  }
  return { providers, functions: classState.functions };
}

export function resolveClassEffectiveFunctionBinding(
  classState: LocalAiSettingsState,
  institution: LocalAiSettingsState,
  platform: LocalAiSettingsState,
  parentKey: string,
  subKey?: string,
): FunctionBindingState | undefined {
  if (subKey) {
    const subBindingKey = subFunctionBindingKey(parentKey, subKey);
    if (hasFunctionBindingOverride(classState, subBindingKey)) {
      return classState.functions[subBindingKey];
    }
  }
  if (hasFunctionBindingOverride(classState, parentKey)) {
    return resolveFunctionBinding(classState, parentKey, subKey);
  }
  return resolveInstitutionEffectiveFunctionBinding(
    institution,
    platform,
    parentKey,
    subKey,
  );
}

export function hasSubFunctionOverride(
  state: LocalAiSettingsState,
  parentKey: string,
  subKey: string,
): boolean {
  return subFunctionBindingKey(parentKey, subKey) in state.functions;
}

export function countSubFunctionOverrides(
  state: LocalAiSettingsState,
  parentKey: string,
): number {
  const fn = getFunctionCatalogEntry(parentKey);
  if (!fn?.subFunctions?.length) return 0;
  return fn.subFunctions.filter((sub) =>
    hasSubFunctionOverride(state, parentKey, sub.key),
  ).length;
}

export function resolveFunctionBinding(
  state: LocalAiSettingsState,
  parentKey: string,
  subKey?: string,
): FunctionBindingState | undefined {
  if (subKey) {
    const override = state.functions[subFunctionBindingKey(parentKey, subKey)];
    if (override) return override;
  }
  return state.functions[parentKey];
}

export function isProviderActive(
  state: LocalAiSettingsState,
  providerId: ProviderId,
  _scope: AiSettingsScope,
): boolean {
  const p = state.providers[providerId];
  if (!p) return false;
  // usePlatformDefault rows may carry merged platform activation (isActive + keyHint).
  return p.isActive && Boolean(p.apiKey || p.keyHint);
}

export function modelSupportsTasks(
  model: ModelCatalogEntry,
  requiredTasks: ModelTask[],
): boolean {
  return requiredTasks.every((t) => model.tasks.includes(t));
}

export function getCatalogModelStatus(
  model: ModelCatalogEntry,
  state: LocalAiSettingsState,
  scope: AiSettingsScope,
): CatalogModelStatus {
  if (model.status === "coming_soon") return "coming_soon";
  if (!isProviderActive(state, model.providerId, scope)) {
    return "provider_inactive";
  }
  return "available";
}

export function filterCatalogModels(input: {
  task?: ModelTask;
  modality?: Modality;
  providerId?: ProviderId;
  modelClass?: ModelClass;
}): ModelCatalogEntry[] {
  return CATALOG_MODELS.filter((m) => {
    if (input.providerId && m.providerId !== input.providerId) return false;
    if (input.modelClass && m.modelClass !== input.modelClass) return false;
    if (input.task && !m.tasks.includes(input.task)) return false;
    if (input.modality) {
      const mods = new Set([...m.io.inputs, ...m.io.outputs]);
      if (!mods.has(input.modality)) return false;
    }
    return true;
  });
}

export function modelsEligibleForFunction(
  fnKey: string,
  state: LocalAiSettingsState,
  scope: AiSettingsScope,
  providerCatalogState?: LocalAiSettingsState,
): ModelCatalogEntry[] {
  const fn = getFunctionCatalogEntry(fnKey);
  if (!fn || fn.status === "coming_soon") return [];
  const catalogState = providerCatalogState ?? state;
  return filterCatalogModels({}).filter(
    (m) =>
      modelSupportsTasks(m, fn.requiredTasks) &&
      getCatalogModelStatus(m, catalogState, scope) === "available",
  );
}

export function groupModelsByProvider(models: ModelCatalogEntry[]) {
  const map = new Map<ProviderId, Map<ModelClass, ModelCatalogEntry[]>>();
  for (const m of models) {
    if (!map.has(m.providerId)) map.set(m.providerId, new Map());
    const byClass = map.get(m.providerId)!;
    if (!byClass.has(m.modelClass)) byClass.set(m.modelClass, []);
    byClass.get(m.modelClass)!.push(m);
  }
  return CATALOG_PROVIDERS.filter((p) => map.has(p.id)).map((provider) => ({
    provider,
    classes: MODEL_CLASS_ORDER.filter((c) => map.get(provider.id)?.has(c)).map(
      (modelClass) => ({
        modelClass,
        label: MODEL_CLASS_LABEL[modelClass],
        models: map.get(provider.id)!.get(modelClass)!,
      }),
    ),
  }));
}

export function groupModelsByClass(models: ModelCatalogEntry[]) {
  return MODEL_CLASS_ORDER.map((modelClass) => ({
    modelClass,
    label: MODEL_CLASS_LABEL[modelClass],
    providers: CATALOG_PROVIDERS.map((provider) => ({
      provider,
      models: models.filter(
        (m) => m.providerId === provider.id && m.modelClass === modelClass,
      ),
    })).filter((g) => g.models.length > 0),
  })).filter((g) => g.providers.length > 0);
}

export function groupModelsByModality(models: ModelCatalogEntry[]) {
  const modalities = new Set<Modality>();
  for (const m of models) {
    for (const mod of [...m.io.inputs, ...m.io.outputs]) modalities.add(mod);
  }
  return [...modalities].map((modality) => ({
    modality,
    models: models.filter(
      (m) => m.io.inputs.includes(modality) || m.io.outputs.includes(modality),
    ),
  }));
}

export function groupCatalog(
  models: ModelCatalogEntry[],
  mode: CatalogBrowseMode,
) {
  if (mode === "category") return groupModelsByClass(models);
  if (mode === "modality") return groupModelsByModality(models);
  return groupModelsByProvider(models);
}

function formatBindingSummary(
  state: LocalAiSettingsState,
  binding: FunctionBindingState,
  scope: AiSettingsScope,
): string | null {
  const model = getModelEntry(binding.modelId);
  const provider = getProviderEntry(binding.providerId);
  if (!model || !provider) return null;
  const provState = state.providers[binding.providerId];
  const keyLabel =
    (scope === "institution" || scope === "class") && provState?.usePlatformDefault
      ? scope === "class"
        ? "institution key"
        : "platform key"
      : "custom key";
  const reasoning = formatReasoningLabel(binding);
  const reasoningSuffix = reasoning ? ` · reasoning ${reasoning}` : "";
  return `${provider.label} · ${model.label}${reasoningSuffix} (${keyLabel})`;
}

export function buildEffectiveSummary(
  state: LocalAiSettingsState,
  scope: AiSettingsScope,
  parents?: {
    platform?: LocalAiSettingsState;
    institution?: LocalAiSettingsState;
  },
): string | null {
  const fn = CATALOG_FUNCTIONS.find((f) => f.status === "available");
  if (!fn) return null;
  const platformState = parents?.platform;
  const institutionState = parents?.institution;

  const catalogState =
    scope === "class" && institutionState && platformState
      ? mergeClassProviderStateForCatalog(state, institutionState, platformState)
      : scope === "institution" && platformState
        ? mergeInstitutionProviderStateForCatalog(state, platformState)
        : state;

  const binding =
    scope === "class" && institutionState && platformState
      ? resolveClassEffectiveFunctionBinding(
          state,
          institutionState,
          platformState,
          fn.key,
        )
      : scope === "institution" && platformState
        ? resolveInstitutionEffectiveFunctionBinding(
            state,
            platformState,
            fn.key,
          )
        : state.functions[fn.key];

  if (!binding) return "No function configured yet.";
  const bindingSummary = formatBindingSummary(catalogState, binding, scope);
  if (!bindingSummary) return null;
  const overrideCount = countSubFunctionOverrides(state, fn.key);
  const overrideNote =
    overrideCount > 0
      ? ` · ${overrideCount} feature${overrideCount === 1 ? "" : "s"} customized`
      : "";
  const inheritNote =
    scope === "institution" &&
    platformState &&
    institutionUsesPlatformFunctionDefault(state, fn.key)
      ? " (platform default)"
      : scope === "class" &&
          institutionState &&
          platformState &&
          institutionUsesPlatformFunctionDefault(state, fn.key)
        ? " (institution default)"
        : "";
  return `${fn.label}: ${bindingSummary}${inheritNote}${overrideNote}`;
}

export { CATALOG_FUNCTIONS, CATALOG_MODELS, CATALOG_PROVIDERS };
