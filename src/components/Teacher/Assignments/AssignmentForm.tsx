"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import MarkdownEditor from "@/components/Shared/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QuestionCard from "@/components/Teacher/Assignments/QuestionCard";
import SelectActivityTemplateDialog, {
  type TemplatePickerItem,
} from "@/components/Teacher/Assignments/SelectActivityTemplateDialog";
import { MoreOptionsGeneral } from "@/components/Teacher/Assignments/MoreOptionsGeneral";
import { SharedContextSection } from "@/components/Teacher/Assignments/SharedContextSection";
import { AssignmentLanguageSection } from "@/components/Teacher/Assignments/AssignmentLanguageSection";
import { InteractionSettingDialog } from "@/components/Teacher/Assignments/InteractionSettingDialog";
import { CollapsibleSection } from "@/components/Teacher/Assignments/CollapsibleSection";
import { AssignmentFormFooter } from "@/components/Teacher/Assignments/AssignmentFormFooter";
import {
  Assignment,
  Question,
  RubricItem,
  ResponderFieldConfig,
  BotPromptConfig,
  allowedFileTypesFromConfig,
  DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES,
  FileSubmissionConfig,
  orderFileSubmissionExtensions,
  assignmentHasDynamicQuestionParts,
  stripDynamicFlagsFromQuestions,
  teacherPromptOrFocus,
} from "@/types/assignment";
import { useAuth } from "@/contexts/AuthContext";
import AssignmentPreviewResponse from "@/components/Teacher/Assignments/AssignmentPreviewResponse";
import type { ClassLanguageConfig } from "@/types/class";
import type { TabSwitchPolicy } from "@/lib/integrity/constants";
import { DEFAULT_TAB_SWITCH_POLICY } from "@/lib/integrity/constants";
import { type AssignmentIntegritySettingsValues } from "@/components/Shared/Integrity/AssignmentIntegritySettings";
import {
  getDefaultBotPromptConfig,
  buildDefaultBotPromptConfig,
  buildDefaultEvaluationPrompt,
  buildDefaultDynamicGenerationPrompt,
  type ActivityType,
} from "@/lib/promptTemplates";
import {
  listActivityTypes,
  getActivityTypeDefinition,
  getActivityTypeLabels,
  getDefaultFeedbackFocusAreas,
} from "@/lib/activityTypes/registry";
import {
  SYSTEM_TEMPLATE_IDS,
  SYSTEM_TEMPLATE_ID_TO_KIND,
  type TemplateDefinition,
} from "@/lib/activityTypes/templates";
import type { ActivityTypeDefaults } from "@/lib/activityTypes/types";
import { useAvailableTemplatesForClass } from "@/hooks/swr";
import { useAudioInputSupport } from "@/hooks/swr/useAudioInputSupport";
import {
  normalizeFeedbackFocusAreas,
  type FeedbackFocusArea,
} from "@/lib/feedbackFocus";
import { Lock, Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { showSuccessToast } from "@/lib/toast";
import { useEffectiveClassSettings } from "@/hooks/swr/useSettings";
import {
  ASSESSMENT_MODE_OPTIONS,
  RETIRED_ASSESSMENT_MODES,
  type AssessmentMode,
} from "@/lib/settings/registry";

/**
 * Seed a multimodal bot config's language-support block from the class-level
 * language defaults. Used in create mode only: the class config provides the
 * default support language and the support lock; the support-enabled flag is the
 * OR of the class default and whatever the activity type already turned on (so
 * e.g. Speaking Practice still enables it even when the class default is off).
 * No-op for non-multimodal modes or when no class config is present.
 */
function withClassLanguageDefaults(
  config: BotPromptConfig,
  interactionType: AssessmentMode,
  classLang: ClassLanguageConfig | null | undefined,
): BotPromptConfig {
  if (interactionType !== "multimodal" || !classLang) return config;
  const existing = config.multimodal_actions ?? {};
  const existingLS = existing.languageSupport ?? {};
  return {
    ...config,
    multimodal_actions: {
      ...existing,
      languageSupport: {
        ...existingLS,
        enabled:
          (existingLS.enabled ?? false) ||
          (classLang.supportLanguageEnabled ?? false),
        ...(classLang.defaultSupportLanguage
          ? { defaultLanguage: classLang.defaultSupportLanguage }
          : {}),
        locked: classLang.lockSupportLanguage ?? false,
      },
    },
  };
}

/**
 * Merge an activity type's multimodal preselection (language support, actions,
 * audio delivery) into a bot prompt config. No-op when the target mode isn't
 * multimodal or the type declares no multimodal defaults. Shared by
 * initial-mount seeding and the template/type change handlers so all three
 * paths apply defaults identically.
 */
function withActivityTypeMultimodalDefaults(
  config: BotPromptConfig,
  multimodalDefaults: ActivityTypeDefaults["multimodal"],
  targetMode: AssessmentMode,
): BotPromptConfig {
  if (!multimodalDefaults || targetMode !== "multimodal") return config;
  return {
    ...config,
    multimodal_actions: {
      ...config.multimodal_actions,
      ...(multimodalDefaults.availableActions !== undefined
        ? { availableActions: multimodalDefaults.availableActions }
        : {}),
      ...(multimodalDefaults.languageSupportEnabled !== undefined
        ? {
            languageSupport: {
              ...config.multimodal_actions?.languageSupport,
              enabled: multimodalDefaults.languageSupportEnabled,
            },
          }
        : {}),
    },
    ...(multimodalDefaults.interactionConfig?.input?.audioDelivery !== undefined
      ? {
          multimodal_interaction: {
            ...config.multimodal_interaction,
            input: {
              ...config.multimodal_interaction?.input,
              audioDelivery:
                multimodalDefaults.interactionConfig.input.audioDelivery,
            },
          },
        }
      : {}),
  };
}

interface AssignmentFormProps {
  mode: "create" | "edit" | "view";
  /** Which internal section to show when `mode === "view"` (ignored otherwise). */
  viewSection?: "content" | "settings";
  classId: string;
  /**
   * Class database id (UUID). When provided, the assessment-mode dropdown is
   * filtered to the institution/class's effective `allowed_assessment_modes`.
   */
  classDbId?: string | null;
  /**
   * Class-level language defaults (primary/support locks + default support
   * language). In create mode these seed the form; ignored in edit mode, where
   * the saved assignment config is authoritative.
   */
  classLanguageConfig?: ClassLanguageConfig | null;
  assignmentId?: string;
  initialTitle?: string;
  initialQuestions?: Question[];
  initialLanguage?: string;
  initialLockLanguage?: boolean;
  initialIsPublic?: boolean;
  initialActivityType?: ActivityType;
  initialActivityTemplateId?: string | null;
  initialActivityDefinition?: TemplateDefinition | null;
  /** When the snapshot was last (re)pulled from a template; drives the edit-mode "update available" hint. */
  initialTemplateSyncedAt?: string | null;
  initialAssessmentMode?: AssessmentMode;
  initialResponderFieldsConfig?: ResponderFieldConfig[];
  initialMaxAttempts?: number;
  initialBotPromptConfig?: BotPromptConfig;
  initialStudentInstructions?: string;
  initialShowRubric?: boolean;
  initialShowRubricPoints?: boolean;
  initialUseStarDisplay?: boolean;
  initialStarScale?: number;
  initialRequireAllAttempts?: boolean;
  initialSharedContextEnabled?: boolean;
  initialSharedContext?: string;
  initialEvaluationPrompt?: string;
  initialFeedbackFocus?: FeedbackFocusArea[];
  initialExperienceRatingEnabled?: boolean;
  initialExperienceRatingRequired?: boolean;
  initialFeedbackRequiresApproval?: boolean;
  initialBatchGradeRelease?: boolean;
  initialAllowCopyPaste?: boolean;
  initialTabSwitchPolicy?: TabSwitchPolicy;
  initialTabSwitchMaxLeaves?: number;
  initialFileSubmissionConfig?: FileSubmissionConfig | null;
  initialDynamicGenerationPrompt?: string;
  initialIsDraft?: boolean;
  /** Omitted in view mode, where no submit action is rendered. */
  onSubmit?: (data: AssignmentFormSubmitData) => Promise<void>;
  /**
   * Save-without-navigating for "Save and Preview". Persists the current config
   * and returns the saved assignment row so the form can open the preview overlay.
   * Create page: create-once-then-update a draft. Edit page: update preserving
   * status. When omitted, the "Save and Preview" button is not shown.
   */
  onSaveForPreview?: (data: AssignmentFormSubmitData) => Promise<Assignment>;
  /** Cancel/close action rendered in the sticky footer. */
  onCancel?: () => void;
}

/** Payload shape shared by `onSubmit` and `onSaveForPreview`. */
export interface AssignmentFormSubmitData {
  title: string;
  questions: Question[];
  totalPoints: number;
  preferredLanguage: string;
  lockLanguage: boolean;
  isPublic: boolean;
  activityType: ActivityType;
  /** Provenance link to the selected template (system row id for built-ins). */
  activityTemplateId?: string | null;
  /** The selected template's definition, snapshotted onto the assignment. */
  activityDefinitionSnapshot?: TemplateDefinition | null;
  /** When the snapshot was last (re)pulled from a template. */
  templateSyncedAt?: string | null;
  assessmentMode: AssessmentMode;
  isDraft: boolean;
  responderFieldsConfig?: ResponderFieldConfig[];
  maxAttempts?: number;
  botPromptConfig?: BotPromptConfig;
  studentInstructions?: string;
  showRubric?: boolean;
  showRubricPoints?: boolean;
  useStarDisplay?: boolean;
  starScale?: number;
  requireAllAttempts?: boolean;
  sharedContextEnabled?: boolean;
  sharedContext?: string;
  evaluationPrompt?: string;
  feedbackFocus?: FeedbackFocusArea[];
  experienceRatingEnabled?: boolean;
  experienceRatingRequired?: boolean;
  feedbackRequiresApproval?: boolean;
  batchGradeRelease?: boolean;
  allowCopyPaste?: boolean;
  tabSwitchPolicy?: TabSwitchPolicy;
  tabSwitchMaxLeaves?: number;
  fileSubmissionConfig?: FileSubmissionConfig | null;
  dynamicQuestionsEnabled?: boolean;
  dynamicGenerationPrompt?: string | null;
}

export default function AssignmentForm({
  mode,
  viewSection,
  classId,
  classDbId = null,
  classLanguageConfig = null,
  assignmentId: _assignmentId,
  initialTitle = "",
  initialQuestions = [
    {
      order: 0,
      prompt: "",
      total_points: 0,
      rubric: [
        { item: "", points: 0 },
        { item: "", points: 0 },
      ],
      supporting_content: "",
      expected_answer: "",
      question_focus: "",
      dynamic_prompt: false,
      dynamic_rubric: false,
    },
  ],
  initialLanguage = "en",
  initialLockLanguage = false,
  initialIsPublic = false,
  initialActivityType = "learning",
  initialActivityTemplateId = null,
  initialActivityDefinition = null,
  initialTemplateSyncedAt = null,
  initialAssessmentMode = "voice",
  initialResponderFieldsConfig,
  initialMaxAttempts = 3,
  initialBotPromptConfig,
  initialStudentInstructions = "",
  initialShowRubric = false,
  initialShowRubricPoints = true,
  initialUseStarDisplay = false,
  initialStarScale = 5,
  initialRequireAllAttempts = false,
  initialSharedContextEnabled = false,
  initialSharedContext = "",
  initialEvaluationPrompt = "",
  initialFeedbackFocus,
  initialExperienceRatingEnabled = false,
  initialExperienceRatingRequired = false,
  initialFeedbackRequiresApproval = false,
  initialBatchGradeRelease = false,
  initialAllowCopyPaste = false,
  initialTabSwitchPolicy = DEFAULT_TAB_SWITCH_POLICY,
  initialTabSwitchMaxLeaves = 3,
  initialFileSubmissionConfig = null,
  initialDynamicGenerationPrompt,
  initialIsDraft = false,
  onSubmit,
  onSaveForPreview,
  onCancel,
}: AssignmentFormProps) {
  const router = useTrackedRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [lockLanguage, setLockLanguage] = useState(initialLockLanguage);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [activityType, setActivityType] =
    useState<ActivityType>(initialActivityType);
  // The selected template's provenance id + snapshotted definition. Built-ins
  // map to their fixed system-row id; the definition drives prompt/eval/label
  // seeding so custom (non-`kind`) templates work too.
  const [activityTemplateId, setActivityTemplateId] = useState<string | null>(
    initialActivityTemplateId ??
      SYSTEM_TEMPLATE_IDS[initialActivityType] ??
      null,
  );
  const [activityDefinition, setActivityDefinition] =
    useState<TemplateDefinition | null>(initialActivityDefinition);
  // When the snapshot was last (re)pulled from a template — advanced only at
  // the seedFromDefinition call sites below, never on a plain save.
  const [templateSyncedAt, setTemplateSyncedAt] = useState<string | null>(
    initialTemplateSyncedAt,
  );
  // In create mode, honor the activity type's preselected interaction type
  // (e.g. Learning → multimodal) instead of the generic "voice" fallback; edit
  // mode always uses the saved value. Restricted by allowedAssessmentModes via
  // the currentAssessmentMode/useEffect pair below if the class disallows it.
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>(
    mode === "create"
      ? (getActivityTypeDefinition(initialActivityType).defaults
          ?.interactionType ?? initialAssessmentMode)
      : initialAssessmentMode,
  );

  // The class palette (system + class-owned + added-personal). Drives the
  // activity-type picker; falls back to the built-in registry list when a class
  // context isn't available yet.
  const availableTemplatesQuery = useAvailableTemplatesForClass(classDbId);
  const availableTemplates = useMemo(
    () => availableTemplatesQuery.data ?? [],
    [availableTemplatesQuery.data],
  );
  // `data === undefined` = the palette query hasn't resolved yet; `[]` = it
  // resolved to an empty class palette (all system types pruned, no class/
  // personal templates). Only the latter shows the explicit empty state; while
  // loading or without a class context we fall back to the built-in kind list.
  const templatesLoaded = availableTemplatesQuery.data !== undefined;
  const useTemplatePicker =
    !!classDbId && templatesLoaded && availableTemplates.length > 0;
  const showNoActivityTypes =
    !!classDbId && templatesLoaded && availableTemplates.length === 0;
  // Items rendered in the template picker dialog. When the class palette is
  // available, these are the class's templates (with descriptions); otherwise
  // fall back to the built-in activity-type kinds. Ensures the current
  // selection is always present, even if it's been removed from the palette
  // or archived since this assignment was created.
  const templateDialogItems = useMemo<TemplatePickerItem[]>(() => {
    if (useTemplatePicker) {
      const opts = availableTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        isCurrent: t.id === activityTemplateId,
      }));
      if (
        activityTemplateId &&
        !opts.some((o) => o.id === activityTemplateId)
      ) {
        opts.unshift({
          id: activityTemplateId,
          name: "Current template",
          description: null,
          isCurrent: true,
        });
      }
      return opts;
    }
    return listActivityTypes().map((def) => ({
      id: def.kind,
      name: def.label,
      description: null,
      isCurrent: def.kind === activityType,
    }));
  }, [useTemplatePicker, availableTemplates, activityTemplateId, activityType]);

  const currentTemplateItem = useMemo(
    () => templateDialogItems.find((i) => i.isCurrent) ?? null,
    [templateDialogItems],
  );

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [interactionSettingDialogOpen, setInteractionSettingDialogOpen] =
    useState(false);

  // In create mode, seed multimodal bot configs from the class language defaults
  // (support enabled/default/lock). No-op in edit mode — the saved assignment
  // config is authoritative there.
  const applyClassLang = useCallback(
    (
      config: BotPromptConfig,
      interactionType: AssessmentMode,
    ): BotPromptConfig =>
      mode === "create"
        ? withClassLanguageDefaults(
            config,
            interactionType,
            classLanguageConfig,
          )
        : config,
    [mode, classLanguageConfig],
  );

  // Pull the class's effective allowed assessment modes (institution → class).
  // Modes outside the allow list are disabled in the dropdown but the current
  // value remains visible so existing assignments stay editable.
  const { data: effectiveClassSettings } = useEffectiveClassSettings(
    classDbId ?? null,
  );
  const allowedAssessmentModes = useMemo<Set<AssessmentMode>>(() => {
    const setting = effectiveClassSettings?.allowed_assessment_modes;
    if (!setting) {
      return new Set(ASSESSMENT_MODE_OPTIONS.map((o) => o.value));
    }
    return new Set((setting.value as AssessmentMode[]) ?? []);
  }, [effectiveClassSettings]);

  // What the dropdown actually renders. In create mode we project the
  // user-/default-state to the first allowed mode when the raw state is
  // restricted, so the trigger never shows a blank value. Edit mode keeps the
  // existing value visible so historic assignments stay editable.
  const currentAssessmentMode = useMemo<AssessmentMode>(() => {
    if (mode === "edit") return assessmentMode;
    const creatable = (m: AssessmentMode) =>
      allowedAssessmentModes.has(m) && !RETIRED_ASSESSMENT_MODES.has(m);
    if (creatable(assessmentMode)) return assessmentMode;
    const first = ASSESSMENT_MODE_OPTIONS.find((o) => creatable(o.value));
    return (first?.value ?? assessmentMode) as AssessmentMode;
  }, [mode, assessmentMode, allowedAssessmentModes]);

  // Keep the underlying state aligned with what the dropdown is showing so
  // form submission and downstream reads (bot prompt, AI panel) all agree.
  useEffect(() => {
    if (currentAssessmentMode === assessmentMode) return;
    setAssessmentMode(currentAssessmentMode);
    setBotPromptConfig(
      applyClassLang(
        buildDefaultBotPromptConfig(activityType, currentAssessmentMode),
        currentAssessmentMode,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAssessmentMode]);

  // Locales the class's STT + TTS models both support — restricts the teacher's
  // support-language picker to capable languages. Undefined while unresolved.
  const [supportedLocales, setSupportedLocales] = useState<
    string[] | undefined
  >(undefined);
  useEffect(() => {
    if (currentAssessmentMode !== "multimodal" || !classDbId) {
      setSupportedLocales(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/multimodal/supported-locales?classDbId=${encodeURIComponent(
            classDbId,
          )}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { supportedLocales?: string[] };
        if (!cancelled) setSupportedLocales(data.supportedLocales ?? []);
      } catch {
        // Leave undefined → fall back to the full locale list.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAssessmentMode, classDbId]);

  // Whether the class's chat model supports direct audio input — gates the
  // "direct audio input" toggle below. Only relevant in multimodal mode.
  const audioInputSupportQuery = useAudioInputSupport(
    currentAssessmentMode === "multimodal" ? classDbId : null,
  );

  const [maxAttempts, setMaxAttempts] = useState(initialMaxAttempts);
  const [responderFieldsConfig, setResponderFieldsConfig] = useState<
    ResponderFieldConfig[]
  >(
    initialResponderFieldsConfig || [
      {
        field: "name",
        type: "text",
        label: "Your Name",
        required: true,
        placeholder: "Enter your name",
      },
    ],
  );
  // In create mode, seed the type's own system prompt/conversation start plus
  // its multimodal preselection (e.g. Learning → MCQ + display_content, language
  // support) instead of the generic voice-mode fallback; edit mode always uses
  // the saved value.
  const [botPromptConfig, setBotPromptConfig] = useState<BotPromptConfig>(
    () => {
      if (initialBotPromptConfig) return initialBotPromptConfig;
      if (mode !== "create") return getDefaultBotPromptConfig();
      const base = buildDefaultBotPromptConfig(
        initialActivityType,
        assessmentMode,
      );
      const withMultimodal = withActivityTypeMultimodalDefaults(
        base,
        getActivityTypeDefinition(initialActivityType).defaults?.multimodal,
        assessmentMode,
      );
      return withClassLanguageDefaults(
        withMultimodal,
        assessmentMode,
        classLanguageConfig,
      );
    },
  );
  const [studentInstructions, setStudentInstructions] = useState(
    initialStudentInstructions,
  );
  const [showRubric, setShowRubric] = useState(initialShowRubric);
  const [showRubricPoints, setShowRubricPoints] = useState(
    initialShowRubricPoints,
  );
  const [useStarDisplay, setUseStarDisplay] = useState(
    // In create mode, honor the activity type's display default (e.g. speaking
    // practice → stars on); edit mode always uses the saved value.
    mode === "create"
      ? (getActivityTypeDefinition(initialActivityType).defaults?.display
          ?.useStarDisplay ?? initialUseStarDisplay)
      : initialUseStarDisplay,
  );
  const [starScale, setStarScale] = useState(initialStarScale);
  const [requireAllAttempts, setRequireAllAttempts] = useState(
    initialRequireAllAttempts,
  );
  const [sharedContextEnabled, setSharedContextEnabled] = useState(
    initialSharedContextEnabled,
  );
  const [sharedContext, setSharedContext] = useState(initialSharedContext);
  const [evaluationPrompt, setEvaluationPrompt] = useState(
    initialEvaluationPrompt ||
      buildDefaultEvaluationPrompt(initialActivityType),
  );
  const [feedbackFocus, setFeedbackFocus] = useState<FeedbackFocusArea[]>(
    initialFeedbackFocus ?? getDefaultFeedbackFocusAreas(initialActivityType),
  );
  const [experienceRatingEnabled, setExperienceRatingEnabled] = useState(
    initialExperienceRatingEnabled,
  );
  const [experienceRatingRequired, setExperienceRatingRequired] = useState(
    initialExperienceRatingRequired,
  );
  const [feedbackRequiresApproval, setFeedbackRequiresApproval] = useState(
    initialFeedbackRequiresApproval,
  );
  const [batchGradeRelease, setBatchGradeRelease] = useState(
    initialBatchGradeRelease,
  );
  const [integritySettings, setIntegritySettings] =
    useState<AssignmentIntegritySettingsValues>({
      allowCopyPaste: initialAllowCopyPaste,
      tabSwitchPolicy: initialTabSwitchPolicy,
      tabSwitchMaxLeaves: initialTabSwitchMaxLeaves,
    });
  // In create mode, honor the activity type's file-submission default (e.g.
  // code review → required); edit mode always uses the saved value.
  const [fileSubmissionEnabled, setFileSubmissionEnabled] = useState(
    mode === "create"
      ? (getActivityTypeDefinition(initialActivityType).defaults?.fileSubmission
          ?.required ?? !!initialFileSubmissionConfig?.required)
      : !!initialFileSubmissionConfig?.required,
  );
  const [fileAllowMultiple, setFileAllowMultiple] = useState(
    initialFileSubmissionConfig?.allow_multiple ?? false,
  );
  const [fileInstructions, setFileInstructions] = useState(
    initialFileSubmissionConfig?.instructions ?? "",
  );
  const [fileAllowedTypes, setFileAllowedTypes] = useState<string[]>(() => {
    const configured = allowedFileTypesFromConfig(initialFileSubmissionConfig);
    if (
      configured.length === 0 &&
      mode === "create" &&
      getActivityTypeDefinition(initialActivityType).defaults?.fileSubmission
        ?.required
    ) {
      return [...DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES];
    }
    return configured;
  });

  const handleToggleAllowedFileType = useCallback(
    (ext: string, selected: boolean) => {
      setFileAllowedTypes((prev) => {
        if (selected) {
          return orderFileSubmissionExtensions([...prev, ext]);
        }
        if (prev.length <= 1 && prev.includes(ext)) {
          return prev;
        }
        return orderFileSubmissionExtensions(prev.filter((e) => e !== ext));
      });
    },
    [],
  );
  const [dynamicGenerationPrompt] = useState(
    initialDynamicGenerationPrompt || buildDefaultDynamicGenerationPrompt(),
  );

  const [loading, setLoading] = useState(false);
  const readOnly = mode === "view";
  const effectiveDisabled = loading || readOnly;
  const [error, setError] = useState<string | null>(null);

  // Save and Preview state. `previewAssignment` is the saved row driving the
  // overlay; it persists across exits so repeat previews re-save the same row.
  const [previewAssignment, setPreviewAssignment] = useState<Assignment | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
    value: Question[keyof Question],
  ) => {
    setQuestions((prevQuestions) => {
      const newQuestions = [...prevQuestions];
      // For array fields like rubric, ensure we create a new array reference with new objects
      if (field === "rubric" && Array.isArray(value)) {
        newQuestions[questionIndex] = {
          ...newQuestions[questionIndex],
          [field]: value.map((item: RubricItem) => ({ ...item })), // Deep copy array items
        };
      } else {
        newQuestions[questionIndex] = {
          ...newQuestions[questionIndex],
          [field]: value,
        };
      }
      return newQuestions;
    });
  };

  const handleRubricChange = (
    questionIndex: number,
    rubricIndex: number,
    field: keyof RubricItem,
    value: string | number,
  ) => {
    const newQuestions = [...questions];
    const newRubric = [...newQuestions[questionIndex].rubric];
    newRubric[rubricIndex] = {
      ...newRubric[rubricIndex],
      [field]: value,
    };
    newQuestions[questionIndex].rubric = newRubric;

    // Don't auto-calculate total points - user enters it manually
    // Validation will check if rubric sum matches total points

    setQuestions(newQuestions);
  };

  const handleAddRubricItem = (questionIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[questionIndex].rubric.push({ item: "", points: 0 });
    setQuestions(newQuestions);
  };

  const handleRemoveRubricItem = (
    questionIndex: number,
    rubricIndex: number,
  ) => {
    const newQuestions = [...questions];
    if (newQuestions[questionIndex].rubric.length > 1) {
      newQuestions[questionIndex].rubric = newQuestions[
        questionIndex
      ].rubric.filter((_, i) => i !== rubricIndex);

      // Don't auto-calculate total points - user enters it manually

      setQuestions(newQuestions);
    }
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      order: questions.length,
      prompt: "",
      total_points: 0,
      rubric: [
        { item: "", points: 0 },
        { item: "", points: 0 },
      ],
      supporting_content: "",
      expected_answer: "",
      question_focus: "",
      dynamic_prompt: false,
      dynamic_rubric: false,
    };
    setQuestions([...questions, newQuestion]);
  };

  const handleMoveQuestionUp = (index: number) => {
    if (index > 0) {
      const newQuestions = [...questions];
      [newQuestions[index - 1], newQuestions[index]] = [
        newQuestions[index],
        newQuestions[index - 1],
      ];
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleMoveQuestionDown = (index: number) => {
    if (index < questions.length - 1) {
      const newQuestions = [...questions];
      [newQuestions[index], newQuestions[index + 1]] = [
        newQuestions[index + 1],
        newQuestions[index],
      ];
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);
    }
  };

  const handleDeleteQuestion = (index: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== index);
      // Update order
      newQuestions.forEach((q, i) => (q.order = i));
      setQuestions(newQuestions);

      // Also remove any question override for the deleted question
      if (botPromptConfig.question_overrides?.[index] !== undefined) {
        const newOverrides = { ...botPromptConfig.question_overrides };
        // Remove the deleted question's override and re-index higher ones
        const updatedOverrides: Record<number, (typeof newOverrides)[number]> =
          {};
        for (const [key, value] of Object.entries(newOverrides)) {
          const order = parseInt(key, 10);
          if (order < index) {
            updatedOverrides[order] = value;
          } else if (order > index) {
            updatedOverrides[order - 1] = value;
          }
          // order === index is skipped (deleted)
        }
        setBotPromptConfig({
          ...botPromptConfig,
          question_overrides:
            Object.keys(updatedOverrides).length > 0
              ? updatedOverrides
              : undefined,
        });
      }
    }
  };

  // Handle question prompt override changes
  const handleQuestionOverrideChange = (
    questionOrder: number,
    override: import("@/types/assignment").QuestionPromptOverride | undefined,
  ) => {
    const currentOverrides = botPromptConfig.question_overrides || {};

    if (override === undefined) {
      // Remove the override for this question
      const { [questionOrder]: _, ...rest } = currentOverrides;
      setBotPromptConfig({
        ...botPromptConfig,
        question_overrides: Object.keys(rest).length > 0 ? rest : undefined,
      });
    } else {
      // Set or update the override for this question
      setBotPromptConfig({
        ...botPromptConfig,
        question_overrides: {
          ...currentOverrides,
          [questionOrder]: override,
        },
      });
    }
  };

  // Get the default conversation start based on question order
  const getDefaultConversationStart = (questionOrder: number) => {
    return questionOrder === 0
      ? botPromptConfig.conversation_start.first_question
      : botPromptConfig.conversation_start.subsequent_questions;
  };

  // Switch activity type: rebuild the default prompts and apply the type's
  // preselected config (interaction type + multimodal language support/actions).
  /**
   * Seed the prompt/eval/label/display/file state from a template's definition
   * (copy-on-select snapshot). Shared by the template picker and the built-in
   * kind fallback so both paths produce identical assignment state.
   */
  const seedFromDefinition = (def: TemplateDefinition) => {
    let targetMode = currentAssessmentMode;
    const desired = def.defaults?.interactionType;
    if (desired && allowedAssessmentModes.has(desired)) {
      targetMode = desired;
      setAssessmentMode(desired);
    }

    const baseConfig: BotPromptConfig = {
      system_prompt: def.systemPrompt,
      conversation_start: { ...def.conversationStart },
    };
    const nextConfig = withActivityTypeMultimodalDefaults(
      baseConfig,
      def.defaults?.multimodal,
      targetMode,
    );

    setBotPromptConfig(applyClassLang(nextConfig, targetMode));
    setEvaluationPrompt(def.evaluationPrompt);
    setFeedbackFocus(def.defaultFeedbackFocusAreas);
    setUseStarDisplay(def.defaults?.display?.useStarDisplay ?? false);
    if (def.defaults?.fileSubmission?.required) {
      setFileSubmissionEnabled(true);
      if (fileAllowedTypes.length === 0) {
        setFileAllowedTypes([...DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES]);
      }
    }
  };

  // Create mode: the initial prompt/eval/label/display/file state above is
  // seeded synchronously from the compiled registry (so the form isn't blank
  // while the class's template palette is still loading). Once that palette
  // resolves, re-seed from the DB row for whatever's currently selected — the
  // initial default, or a pre-load pick made via the built-in-kind fallback
  // picker — so a super admin's DB-only edit to a system template is honored
  // even when the teacher never touches the Activity Type control. No-op once
  // `activityDefinition` is set (an explicit template pick already captured
  // the DB row directly, synchronously — this only fills the gap before that).
  useEffect(() => {
    if (mode !== "create") return;
    if (!activityTemplateId || activityDefinition) return;
    const row = availableTemplates.find((t) => t.id === activityTemplateId);
    if (!row) return;
    setActivityDefinition(row.definition);
    setTemplateSyncedAt(row.updated_at);
    seedFromDefinition(row.definition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activityTemplateId, activityDefinition, availableTemplates]);

  /** Teacher picked a template from the class palette → snapshot its definition. */
  const handleTemplateChange = (templateId: string) => {
    const row = availableTemplates.find((t) => t.id === templateId);
    if (!row) return;
    setActivityTemplateId(row.id);
    setActivityDefinition(row.definition);
    setTemplateSyncedAt(row.updated_at);
    setActivityType(SYSTEM_TEMPLATE_ID_TO_KIND[row.id] ?? activityType);
    seedFromDefinition(row.definition);
  };

  /** Re-pull the selected template's current definition into this assignment. */
  const handleUpdateFromTemplate = () => {
    if (!activityTemplateId) return;
    const row = availableTemplates.find((t) => t.id === activityTemplateId);
    if (!row) return;
    setActivityDefinition(row.definition);
    setTemplateSyncedAt(row.updated_at);
    seedFromDefinition(row.definition);
    showSuccessToast("Updated from template.");
  };

  const isUpdateAvailable = useMemo(() => {
    if (mode !== "edit" || !activityTemplateId || !templateSyncedAt)
      return false;
    const row = availableTemplates.find((t) => t.id === activityTemplateId);
    if (!row) return false;
    return (
      new Date(row.updated_at).getTime() > new Date(templateSyncedAt).getTime()
    );
  }, [mode, activityTemplateId, availableTemplates, templateSyncedAt]);

  const handleActivityTypeChange = (value: string) => {
    const newType = value as ActivityType;
    setActivityType(newType);
    // Built-in kind fallback (used before the class palette loads): point the
    // provenance at the seeded system row and let the save path re-derive the
    // snapshot from the registry (definition left null).
    setActivityTemplateId(SYSTEM_TEMPLATE_IDS[newType] ?? null);
    setActivityDefinition(null);

    const def = getActivityTypeDefinition(newType);

    // Switch interaction type when the type asks for one and the class allows it.
    let targetMode = currentAssessmentMode;
    const desired = def.defaults?.interactionType;
    if (desired && allowedAssessmentModes.has(desired)) {
      targetMode = desired;
      setAssessmentMode(desired);
    }

    const baseConfig = buildDefaultBotPromptConfig(newType, targetMode);

    // Multimodal preselection (language support + actions) for the new type.
    const nextConfig = withActivityTypeMultimodalDefaults(
      baseConfig,
      def.defaults?.multimodal,
      targetMode,
    );

    // Layer the class language defaults under the activity type's preselection
    // (the activity type's support-enabled flag wins where it sets one).
    setBotPromptConfig(applyClassLang(nextConfig, targetMode));
    setEvaluationPrompt(buildDefaultEvaluationPrompt(newType));
    setFeedbackFocus(getDefaultFeedbackFocusAreas(newType));

    // Apply the type's display-setting defaults (e.g. speaking practice → stars).
    setUseStarDisplay(def.defaults?.display?.useStarDisplay ?? false);

    // Apply the type's file-submission default (e.g. code review → required).
    if (def.defaults?.fileSubmission?.required) {
      setFileSubmissionEnabled(true);
      if (fileAllowedTypes.length === 0) {
        setFileAllowedTypes([...DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES]);
      }
    }
  };

  /** Route a picker-dialog selection to the template or built-in-kind path. */
  const handleSelectTemplateItem = (id: string) => {
    if (useTemplatePicker) {
      handleTemplateChange(id);
    } else {
      handleActivityTypeChange(id);
    }
  };

  /**
   * Run full client-side validation. Returns an error message (also stored in
   * `error`) when invalid, or null when the form is good to save. Shared by
   * Save / Save as Draft and Save and Preview so they can't drift.
   */
  const validate = (): string | null => {
    if (!title.trim()) {
      return "Assignment title is required";
    }

    if (sharedContextEnabled && !sharedContext.trim()) {
      return "Additional context text is required when additional context is enabled";
    }

    if (fileSubmissionEnabled && fileAllowedTypes.length === 0) {
      return "Select at least one acceptable file type.";
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      if (!teacherPromptOrFocus(question).trim()) {
        return `Question ${i + 1}: ${question.dynamic_prompt ? "Guidelines for the question" : getActivityTypeLabels(activityType).question} is required`;
      }

      if (question.total_points <= 0) {
        return `Question ${i + 1}: Total points must be greater than 0`;
      }

      if (!question.dynamic_rubric) {
        const validRubricItems = question.rubric.filter(
          (item) => item.item.trim() && item.points > 0,
        );

        if (validRubricItems.length === 0) {
          return `Question ${i + 1}: At least one valid rubric item is required`;
        }

        const rubricSum = validRubricItems.reduce(
          (sum, item) => sum + (item.points || 0),
          0,
        );
        if (rubricSum !== question.total_points) {
          return `Question ${i + 1}: Rubric points (${rubricSum}) must equal total points (${question.total_points})`;
        }
      }
    }

    return null;
  };

  /** Assemble the full save payload from current form state. */
  const buildSubmitData = (draft: boolean): AssignmentFormSubmitData => {
    let cleanedQuestions = questions.map((q) => ({
      ...q,
      rubric: q.dynamic_rubric
        ? q.rubric
        : q.rubric.filter((item) => item.item.trim() && item.points > 0),
    }));

    if (!fileSubmissionEnabled) {
      cleanedQuestions = stripDynamicFlagsFromQuestions(cleanedQuestions);
    }

    const totalPoints = cleanedQuestions.reduce(
      (sum, q) => sum + q.total_points,
      0,
    );

    const dynamicQuestionsEnabled =
      fileSubmissionEnabled &&
      assignmentHasDynamicQuestionParts(cleanedQuestions);

    return {
      title: title.trim(),
      questions: cleanedQuestions,
      totalPoints,
      preferredLanguage,
      lockLanguage,
      isPublic,
      activityType,
      activityTemplateId,
      activityDefinitionSnapshot: activityDefinition,
      templateSyncedAt,
      assessmentMode: currentAssessmentMode,
      isDraft: draft,
      responderFieldsConfig: isPublic ? responderFieldsConfig : undefined,
      maxAttempts,
      // Always retain botPromptConfig so switching modes doesn't lose it
      botPromptConfig,
      studentInstructions: studentInstructions.trim() || undefined,
      showRubric,
      showRubricPoints,
      useStarDisplay,
      starScale,
      requireAllAttempts,
      sharedContextEnabled,
      sharedContext: sharedContextEnabled ? sharedContext.trim() : undefined,
      evaluationPrompt: evaluationPrompt.trim() || undefined,
      feedbackFocus: normalizeFeedbackFocusAreas(feedbackFocus),
      experienceRatingEnabled,
      experienceRatingRequired: experienceRatingEnabled
        ? experienceRatingRequired
        : false,
      feedbackRequiresApproval,
      batchGradeRelease: feedbackRequiresApproval ? batchGradeRelease : false,
      allowCopyPaste: integritySettings.allowCopyPaste,
      tabSwitchPolicy: integritySettings.tabSwitchPolicy,
      tabSwitchMaxLeaves: integritySettings.tabSwitchMaxLeaves,
      fileSubmissionConfig: fileSubmissionEnabled
        ? {
            required: true,
            allow_multiple: fileAllowMultiple,
            instructions: fileInstructions.trim() || undefined,
            allowed_file_types: orderFileSubmissionExtensions(fileAllowedTypes),
          }
        : null,
      dynamicQuestionsEnabled,
      dynamicGenerationPrompt: dynamicQuestionsEnabled
        ? dynamicGenerationPrompt.trim() || null
        : null,
    };
  };

  const handleSubmit = async (e: React.FormEvent, draft: boolean = false) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await onSubmit?.(buildSubmitData(draft));

      // Navigate based on mode
      if (mode === "edit") {
        showSuccessToast("Assignment updated successfully");
      } else {
        router.push(`/teacher/classes/${classId}`);
      }
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : null;
      console.error(
        `Error ${mode === "edit" ? "updating" : "creating"} assignment:`,
        err,
      );
      setError(
        message
          ? `Failed to ${mode === "edit" ? "update" : "create"} assignment: ${message}`
          : `Failed to ${
              mode === "edit" ? "update" : "create"
            } assignment. Please try again.`,
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save the current config without navigating, then open the preview overlay.
   * Create mode saves as a draft; edit mode preserves status (handled page-side).
   */
  const doSaveAndPreview = async () => {
    if (!onSaveForPreview) return;
    setError(null);
    setLoading(true);
    try {
      // Create → draft; edit → keep current status (the page ignores isDraft for
      // status on preview saves, but pass the faithful value regardless).
      const saved = await onSaveForPreview(
        buildSubmitData(mode === "create" ? true : initialIsDraft),
      );
      setPreviewAssignment(saved);
      setPreviewOpen(true);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : null;
      console.error("Error saving for preview:", err);
      setError(
        message
          ? `Failed to save for preview: ${message}`
          : "Failed to save for preview. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndPreview = (e: React.MouseEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    void doSaveAndPreview();
  };

  const tabsControlProps =
    mode === "view"
      ? { value: viewSection ?? "content", onValueChange: () => {} }
      : { defaultValue: "content" as const };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 pb-28">
        <Tabs {...tabsControlProps} className="w-full">
          {mode !== "view" && (
            <TabsList className="h-auto w-full justify-start rounded-none border-b border-[var(--class-underline-tab-rule)] bg-transparent p-0">
              <TabsTrigger
                value="content"
                className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
              >
                Content
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="rounded-none border-b-2 border-transparent px-6 py-3 text-base font-medium data-[state=active]:!border-[var(--class-underline-tab-active-accent)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none"
              >
                Settings
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent
            value="content"
            className={`space-y-6 ${mode === "view" ? "" : "pt-6"}`}
          >
            {mode !== "view" && (
              <>
                {/* Assignment Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={loading}
                    placeholder="Enter title"
                  />
                </div>

                {/* Instructions (markdown) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="studentInstructions">Instructions</Label>
                      <InfoTooltip text="Enter the instructions for the activity." />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Markdown supported
                    </span>
                  </div>
                  <MarkdownEditor
                    id="studentInstructions"
                    value={studentInstructions}
                    onChange={setStudentInstructions}
                    disabled={loading}
                    placeholder="Enter instructions for the activity..."
                    rows={4}
                  />
                </div>
              </>
            )}

            {/* Activity Type & Interaction Type (side by side) */}
            <SettingsCard className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="activityType">
                  Activity Type <span className="text-destructive">*</span>
                </Label>
                {showNoActivityTypes ? (
                  <div className="rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                    No activity types are enabled for this class.{" "}
                    <Link
                      href={`/teacher/classes/${classId}/settings`}
                      className="font-medium text-foreground underline underline-offset-2"
                    >
                      Enable some in Class settings → Activity Types
                    </Link>
                    .
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {currentTemplateItem?.name ?? "Select a template"}
                      </div>
                      {currentTemplateItem?.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {currentTemplateItem.description}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTemplateDialogOpen(true)}
                        disabled={effectiveDisabled}
                      >
                        Select
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="assessmentMode">
                  Interaction Type <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={currentAssessmentMode}
                    onValueChange={(value) => {
                      const newMode = value as AssessmentMode;
                      setAssessmentMode(newMode);
                      // Keep the selected template's prompt when re-seeding for the
                      // new mode (mode never changes the system prompt itself).
                      const baseConfig: BotPromptConfig = activityDefinition
                        ? {
                            system_prompt: activityDefinition.systemPrompt,
                            conversation_start: {
                              ...activityDefinition.conversationStart,
                            },
                          }
                        : buildDefaultBotPromptConfig(activityType, newMode);
                      setBotPromptConfig(applyClassLang(baseConfig, newMode));
                    }}
                    disabled={effectiveDisabled}
                  >
                    <SelectTrigger
                      id="assessmentMode"
                      readOnly={readOnly}
                      className="flex-1"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_MODE_OPTIONS.map((opt) => {
                        const isAllowed = allowedAssessmentModes.has(opt.value);
                        const isCurrent = opt.value === currentAssessmentMode;
                        // Retired modes (voice, text chat) are no longer creatable.
                        // Hide them unless this is the current value, so existing
                        // assignments of that type stay editable.
                        if (
                          RETIRED_ASSESSMENT_MODES.has(opt.value) &&
                          !isCurrent
                        ) {
                          return null;
                        }
                        // Disabled if the institution restricts it, unless this is the
                        // current value (so existing assignments remain editable).
                        if (!isAllowed && !isCurrent) {
                          return (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              disabled
                            >
                              <span className="flex w-full items-center justify-between gap-3">
                                <span>{opt.label}</span>
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="pointer-events-auto inline-flex">
                                        <Lock
                                          className="h-3.5 w-3.5 text-muted-foreground"
                                          aria-label="Restricted"
                                        />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      This interaction type isn&apos;t allowed for
                                      this class. Contact your admin to enable it.
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </span>
                            </SelectItem>
                          );
                        }
                        return (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {currentAssessmentMode === "multimodal" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setInteractionSettingDialogOpen(true)}
                      disabled={effectiveDisabled}
                      aria-label="Multimodal Setting"
                      title="Multimodal Setting"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </SettingsCard>

            {/* Language (primary + support) */}
            <CollapsibleSection title="Language" disabled={loading}>
              <AssignmentLanguageSection
                preferredLanguage={preferredLanguage}
                setPreferredLanguage={setPreferredLanguage}
                lockLanguage={lockLanguage}
                setLockLanguage={setLockLanguage}
                botPromptConfig={botPromptConfig}
                setBotPromptConfig={setBotPromptConfig}
                supportedLocales={supportedLocales}
                loading={effectiveDisabled}
                readOnly={readOnly}
                activityType={activityType}
              />
            </CollapsibleSection>

            <SharedContextSection
              sharedContextEnabled={sharedContextEnabled}
              setSharedContextEnabled={setSharedContextEnabled}
              sharedContext={sharedContext}
              setSharedContext={setSharedContext}
              readOnly={readOnly}
              loading={effectiveDisabled}
            />

            <div className="space-y-4">
              {questions.map((question, index) => (
                <QuestionCard
                  key={index}
                  question={question}
                  index={index}
                  totalQuestions={questions.length}
                  onChange={handleQuestionChange}
                  onRubricChange={handleRubricChange}
                  onAddRubricItem={handleAddRubricItem}
                  onRemoveRubricItem={handleRemoveRubricItem}
                  onMoveUp={handleMoveQuestionUp}
                  onMoveDown={handleMoveQuestionDown}
                  onDelete={handleDeleteQuestion}
                  disabled={effectiveDisabled}
                  readOnly={readOnly}
                  fileSubmissionEnabled={fileSubmissionEnabled}
                  title={title}
                  studentInstructions={studentInstructions}
                  contextForAI={sharedContext}
                  showBotOverride={
                    currentAssessmentMode === "voice" ||
                    currentAssessmentMode === "text_chat"
                  }
                  questionOverride={
                    botPromptConfig.question_overrides?.[question.order]
                  }
                  onQuestionOverrideChange={handleQuestionOverrideChange}
                  classDbId={classDbId}
                  activityType={activityType}
                  defaultSystemPrompt={botPromptConfig.system_prompt}
                  defaultConversationStart={getDefaultConversationStart(
                    question.order,
                  )}
                />
              ))}
            </div>

            {!readOnly && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddQuestion}
                  disabled={loading}
                >
                  + Add {getActivityTypeLabels(activityType).question}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="settings"
            className={mode === "view" ? "" : "pt-6"}
          >
            <MoreOptionsGeneral
              maxAttempts={maxAttempts}
              setMaxAttempts={setMaxAttempts}
              requireAllAttempts={requireAllAttempts}
              setRequireAllAttempts={setRequireAllAttempts}
              showRubric={showRubric}
              setShowRubric={setShowRubric}
              showRubricPoints={showRubricPoints}
              setShowRubricPoints={setShowRubricPoints}
              useStarDisplay={useStarDisplay}
              setUseStarDisplay={setUseStarDisplay}
              starScale={starScale}
              setStarScale={setStarScale}
              experienceRatingEnabled={experienceRatingEnabled}
              setExperienceRatingEnabled={setExperienceRatingEnabled}
              experienceRatingRequired={experienceRatingRequired}
              setExperienceRatingRequired={setExperienceRatingRequired}
              feedbackRequiresApproval={feedbackRequiresApproval}
              setFeedbackRequiresApproval={setFeedbackRequiresApproval}
              batchGradeRelease={batchGradeRelease}
              setBatchGradeRelease={setBatchGradeRelease}
              integritySettings={integritySettings}
              setIntegritySettings={setIntegritySettings}
              isPublic={isPublic}
              setIsPublic={setIsPublic}
              responderFieldsConfig={responderFieldsConfig}
              setResponderFieldsConfig={setResponderFieldsConfig}
              fileSubmissionEnabled={fileSubmissionEnabled}
              setFileSubmissionEnabled={(enabled) => {
                setFileSubmissionEnabled(enabled);
                if (!enabled) {
                  setQuestions((prev) => stripDynamicFlagsFromQuestions(prev));
                }
                if (enabled && fileAllowedTypes.length === 0) {
                  setFileAllowedTypes([
                    ...DEFAULT_FILE_SUBMISSION_ALLOWED_TYPES,
                  ]);
                }
              }}
              fileAllowMultiple={fileAllowMultiple}
              setFileAllowMultiple={setFileAllowMultiple}
              fileAllowedTypes={fileAllowedTypes}
              onToggleAllowedFileType={handleToggleAllowedFileType}
              fileInstructions={fileInstructions}
              setFileInstructions={setFileInstructions}
              loading={effectiveDisabled}
              readOnly={readOnly}
            />
          </TabsContent>
        </Tabs>

        {mode !== "view" && (
          <AssignmentFormFooter
            mode={mode}
            initialIsDraft={initialIsDraft}
            loading={loading}
            error={error}
            onCancel={onCancel}
            onSaveDraft={(e) => handleSubmit(e, true)}
            onSaveAndPreview={
              onSaveForPreview ? handleSaveAndPreview : undefined
            }
          />
        )}
      </form>

      {/* Preview overlay — renders the student experience over the builder. */}
      {previewOpen && previewAssignment && user && (
        <AssignmentPreviewResponse
          assignment={previewAssignment}
          teacherId={user.id}
          classId={classId}
          onExit={() => setPreviewOpen(false)}
        />
      )}

      <SelectActivityTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        items={templateDialogItems}
        onSelect={handleSelectTemplateItem}
        updateAvailable={mode === "edit" && isUpdateAvailable}
        onApplyUpdate={handleUpdateFromTemplate}
        createHref={`/teacher/classes/${classId}/settings/activity-templates/new`}
      />
      <InteractionSettingDialog
        open={interactionSettingDialogOpen}
        onOpenChange={setInteractionSettingDialogOpen}
        audioDelivery={botPromptConfig.multimodal_interaction?.input?.audioDelivery ?? "transcribe"}
        onAudioDeliveryChange={(audioDelivery) =>
          setBotPromptConfig({
            ...botPromptConfig,
            multimodal_interaction: {
              ...botPromptConfig.multimodal_interaction,
              input: {
                ...botPromptConfig.multimodal_interaction?.input,
                audioDelivery,
              },
            },
          })
        }
        audioInputSupported={audioInputSupportQuery.data?.audioInputSupported}
        disabled={effectiveDisabled}
      />
    </>
  );
}
