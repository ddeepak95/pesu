"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import MarkdownEditor from "@/components/Shared/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import QuestionCard from "@/components/Teacher/Assignments/QuestionCard";
import { MoreOptionsGeneral } from "@/components/Teacher/Assignments/MoreOptionsGeneral";
import { MoreOptionsAIBot } from "@/components/Teacher/Assignments/MoreOptionsAIBot";
import { AssignmentLanguageSection } from "@/components/Teacher/Assignments/AssignmentLanguageSection";
import { CollapsibleSection } from "@/components/Teacher/Assignments/CollapsibleSection";
import type { ActionKind } from "@/lib/multimodal/actions/types";
import {
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
import type { ClassLanguageConfig } from "@/types/class";
import type { TabSwitchPolicy } from "@/lib/integrity/constants";
import { DEFAULT_TAB_SWITCH_POLICY } from "@/lib/integrity/constants";
import { type AssignmentIntegritySettingsValues } from "@/components/Shared/Integrity/AssignmentIntegritySettings";
import {
  getDefaultBotPromptConfig,
  getDefaultEvaluationPrompt,
  buildDefaultBotPromptConfig,
  buildDefaultEvaluationPrompt,
  buildDefaultDynamicGenerationPrompt,
  type ActivityType,
} from "@/lib/promptTemplates";
import {
  listActivityTypes,
  getActivityTypeDefinition,
  getActivityTypeLabels,
} from "@/lib/activityTypes/registry";
import { Lock } from "lucide-react";
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

interface AssignmentFormProps {
  mode: "create" | "edit";
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
  initialExperienceRatingEnabled?: boolean;
  initialExperienceRatingRequired?: boolean;
  initialFeedbackRequiresApproval?: boolean;
  initialAllowCopyPaste?: boolean;
  initialTabSwitchPolicy?: TabSwitchPolicy;
  initialTabSwitchMaxLeaves?: number;
  initialFileSubmissionConfig?: FileSubmissionConfig | null;
  initialDynamicGenerationPrompt?: string;
  initialIsDraft?: boolean;
  onSubmit: (data: {
    title: string;
    questions: Question[];
    totalPoints: number;
    preferredLanguage: string;
    lockLanguage: boolean;
    isPublic: boolean;
    activityType: ActivityType;
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
    experienceRatingEnabled?: boolean;
    experienceRatingRequired?: boolean;
    feedbackRequiresApproval?: boolean;
    allowCopyPaste?: boolean;
    tabSwitchPolicy?: TabSwitchPolicy;
    tabSwitchMaxLeaves?: number;
    fileSubmissionConfig?: FileSubmissionConfig | null;
    dynamicQuestionsEnabled?: boolean;
    dynamicGenerationPrompt?: string | null;
  }) => Promise<void>;
}

export default function AssignmentForm({
  mode,
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
  initialExperienceRatingEnabled = false,
  initialExperienceRatingRequired = false,
  initialFeedbackRequiresApproval = false,
  initialAllowCopyPaste = false,
  initialTabSwitchPolicy = DEFAULT_TAB_SWITCH_POLICY,
  initialTabSwitchMaxLeaves = 3,
  initialFileSubmissionConfig = null,
  initialDynamicGenerationPrompt,
  initialIsDraft = false,
  onSubmit,
}: AssignmentFormProps) {
  const router = useTrackedRouter();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [preferredLanguage, setPreferredLanguage] = useState(initialLanguage);
  const [lockLanguage, setLockLanguage] = useState(initialLockLanguage);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [activityType, setActivityType] =
    useState<ActivityType>(initialActivityType);
  const [assessmentMode, setAssessmentMode] = useState<AssessmentMode>(
    initialAssessmentMode,
  );

  // In create mode, seed multimodal bot configs from the class language defaults
  // (support enabled/default/lock). No-op in edit mode — the saved assignment
  // config is authoritative there.
  const applyClassLang = useCallback(
    (config: BotPromptConfig, interactionType: AssessmentMode): BotPromptConfig =>
      mode === "create"
        ? withClassLanguageDefaults(config, interactionType, classLanguageConfig)
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
    if (allowedAssessmentModes.has(assessmentMode)) return assessmentMode;
    const first = ASSESSMENT_MODE_OPTIONS.find((o) =>
      allowedAssessmentModes.has(o.value),
    );
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

  // Which multimodal actions the class can actually run (capability gating for
  // the teacher toggles). Undefined while unresolved / not multimodal → no gate.
  const [availableActionKinds, setAvailableActionKinds] = useState<
    ActionKind[] | undefined
  >(undefined);
  useEffect(() => {
    if (currentAssessmentMode !== "multimodal" || !classDbId) {
      setAvailableActionKinds(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/multimodal/available-actions?classDbId=${encodeURIComponent(
            classDbId,
          )}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { availableActions?: ActionKind[] };
        if (!cancelled) setAvailableActionKinds(data.availableActions ?? []);
      } catch {
        // Leave undefined → no gating rather than blocking the editor.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAssessmentMode, classDbId]);

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
  const [botPromptConfig, setBotPromptConfig] = useState<BotPromptConfig>(
    initialBotPromptConfig || getDefaultBotPromptConfig(),
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
      ? getActivityTypeDefinition(initialActivityType).defaults?.display
          ?.useStarDisplay ?? initialUseStarDisplay
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
    initialEvaluationPrompt || getDefaultEvaluationPrompt(),
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
  const [integritySettings, setIntegritySettings] =
    useState<AssignmentIntegritySettingsValues>({
      allowCopyPaste: initialAllowCopyPaste,
      tabSwitchPolicy: initialTabSwitchPolicy,
      tabSwitchMaxLeaves: initialTabSwitchMaxLeaves,
    });
  const [fileSubmissionEnabled, setFileSubmissionEnabled] = useState(
    !!initialFileSubmissionConfig?.required,
  );
  const [fileAllowMultiple, setFileAllowMultiple] = useState(
    initialFileSubmissionConfig?.allow_multiple ?? false,
  );
  const [fileInstructions, setFileInstructions] = useState(
    initialFileSubmissionConfig?.instructions ?? "",
  );
  const [fileAllowedTypes, setFileAllowedTypes] = useState<string[]>(() =>
    allowedFileTypesFromConfig(initialFileSubmissionConfig),
  );

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
  const [dynamicGenerationPrompt, setDynamicGenerationPrompt] = useState(
    initialDynamicGenerationPrompt || buildDefaultDynamicGenerationPrompt(),
  );

  const hasPerQuestionDynamic = useMemo(
    () => assignmentHasDynamicQuestionParts(questions),
    [questions],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBotPreview, setShowBotPreview] = useState(false);

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
  const handleActivityTypeChange = (value: string) => {
    const newType = value as ActivityType;
    setActivityType(newType);

    const def = getActivityTypeDefinition(newType);

    // Switch interaction type when the type asks for one and the class allows it.
    let targetMode = currentAssessmentMode;
    const desired = def.defaults?.interactionType;
    if (desired && allowedAssessmentModes.has(desired)) {
      targetMode = desired;
      setAssessmentMode(desired);
    }

    let nextConfig = buildDefaultBotPromptConfig(newType, targetMode);

    // Multimodal preselection (language support + actions) for the new type.
    const mm = def.defaults?.multimodal;
    if (mm && targetMode === "multimodal") {
      nextConfig = {
        ...nextConfig,
        multimodal_actions: {
          ...nextConfig.multimodal_actions,
          ...(mm.availableActions !== undefined
            ? { availableActions: mm.availableActions }
            : {}),
          ...(mm.languageSupportEnabled !== undefined
            ? {
                languageSupport: {
                  ...nextConfig.multimodal_actions?.languageSupport,
                  enabled: mm.languageSupportEnabled,
                },
              }
            : {}),
        },
      };
    }

    // Layer the class language defaults under the activity type's preselection
    // (the activity type's support-enabled flag wins where it sets one).
    setBotPromptConfig(applyClassLang(nextConfig, targetMode));
    setEvaluationPrompt(buildDefaultEvaluationPrompt(newType));

    // Apply the type's display-setting defaults (e.g. speaking practice → stars).
    setUseStarDisplay(def.defaults?.display?.useStarDisplay ?? false);
  };

  const handleSubmit = async (e: React.FormEvent, draft: boolean = false) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!title.trim()) {
      setError("Assignment title is required");
      return;
    }

    if (sharedContextEnabled && !sharedContext.trim()) {
      setError(
        "Additional context text is required when additional context is enabled",
      );
      return;
    }

    if (fileSubmissionEnabled && fileAllowedTypes.length === 0) {
      setError("Select at least one acceptable file type.");
      return;
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      if (!teacherPromptOrFocus(question).trim()) {
        setError(
          `Question ${i + 1}: ${question.dynamic_prompt ? "Guidelines for the question" : getActivityTypeLabels(activityType).question} is required`,
        );
        return;
      }

      if (question.total_points <= 0) {
        setError(`Question ${i + 1}: Total points must be greater than 0`);
        return;
      }

      if (!question.dynamic_rubric) {
        const validRubricItems = question.rubric.filter(
          (item) => item.item.trim() && item.points > 0,
        );

        if (validRubricItems.length === 0) {
          setError(
            `Question ${i + 1}: At least one valid rubric item is required`,
          );
          return;
        }

        const rubricSum = validRubricItems.reduce(
          (sum, item) => sum + (item.points || 0),
          0,
        );
        if (rubricSum !== question.total_points) {
          setError(
            `Question ${
              i + 1
            }: Rubric points (${rubricSum}) must equal total points (${
              question.total_points
            })`,
          );
          return;
        }
      }
    }

    setLoading(true);

    try {
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

      await onSubmit({
        title: title.trim(),
        questions: cleanedQuestions,
        totalPoints,
        preferredLanguage,
        lockLanguage,
        isPublic,
        activityType,
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
        experienceRatingEnabled,
        experienceRatingRequired: experienceRatingEnabled
          ? experienceRatingRequired
          : false,
        feedbackRequiresApproval,
        allowCopyPaste: integritySettings.allowCopyPaste,
        tabSwitchPolicy: integritySettings.tabSwitchPolicy,
        tabSwitchMaxLeaves: integritySettings.tabSwitchMaxLeaves,
        fileSubmissionConfig: fileSubmissionEnabled
          ? {
              required: true,
              allow_multiple: fileAllowMultiple,
              instructions: fileInstructions.trim() || undefined,
              allowed_file_types:
                orderFileSubmissionExtensions(fileAllowedTypes),
            }
          : null,
        dynamicQuestionsEnabled,
        dynamicGenerationPrompt: dynamicQuestionsEnabled
          ? dynamicGenerationPrompt.trim() || null
          : null,
      });

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* Activity Type & Interaction Type (side by side) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="activityType">
            Activity Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={activityType}
            onValueChange={handleActivityTypeChange}
            disabled={loading}
          >
            <SelectTrigger id="activityType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listActivityTypes().map((def) => (
                <SelectItem key={def.kind} value={def.kind}>
                  {def.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="assessmentMode">
            Interaction Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={currentAssessmentMode}
            onValueChange={(value) => {
              const newMode = value as AssessmentMode;
              setAssessmentMode(newMode);
              setBotPromptConfig(
                applyClassLang(
                  buildDefaultBotPromptConfig(activityType, newMode),
                  newMode,
                ),
              );
            }}
            disabled={loading}
          >
            <SelectTrigger id="assessmentMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSESSMENT_MODE_OPTIONS.map((opt) => {
                const isAllowed = allowedAssessmentModes.has(opt.value);
                const isCurrent = opt.value === currentAssessmentMode;
                // Disabled if the institution restricts it, unless this is the
                // current value (so existing assignments remain editable).
                if (!isAllowed && !isCurrent) {
                  return (
                    <SelectItem key={opt.value} value={opt.value} disabled>
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
                              This interaction type isn&apos;t allowed for this
                              class. Contact your admin to enable it.
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
        </div>
      </div>

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
          loading={loading}
        />
      </CollapsibleSection>

      {/* More Options (with General & AI Bot subtabs) */}
      <CollapsibleSection
        title="More Options"
        disabled={loading}
        contentClassName="bg-muted/90"
      >
            <Tabs defaultValue="general">
              <MutedPrimaryTabsList className="mb-4 mt-4 h-auto w-auto gap-1 rounded-md p-1">
                <MutedPrimaryTabsTrigger
                  value="general"
                  className="rounded-sm px-4 py-2"
                >
                  General
                </MutedPrimaryTabsTrigger>
                <MutedPrimaryTabsTrigger
                  value="aibot"
                  className="rounded-sm px-4 py-2"
                >
                  AI Config
                </MutedPrimaryTabsTrigger>
              </MutedPrimaryTabsList>

              <TabsContent value="general">
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
                      setQuestions((prev) =>
                        stripDynamicFlagsFromQuestions(prev),
                      );
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
                  loading={loading}
                />
              </TabsContent>

              <TabsContent value="aibot">
                <MoreOptionsAIBot
                  assessmentMode={currentAssessmentMode}
                  showBotPreview={showBotPreview}
                  setShowBotPreview={setShowBotPreview}
                  botPromptConfig={botPromptConfig}
                  setBotPromptConfig={setBotPromptConfig}
                  evaluationPrompt={evaluationPrompt}
                  setEvaluationPrompt={setEvaluationPrompt}
                  activityType={activityType}
                  questions={questions}
                  title={title}
                  studentInstructions={studentInstructions}
                  preferredLanguage={preferredLanguage}
                  maxAttempts={maxAttempts}
                  sharedContextEnabled={sharedContextEnabled}
                  setSharedContextEnabled={setSharedContextEnabled}
                  sharedContext={sharedContext}
                  setSharedContext={setSharedContext}
                  loading={loading}
                  dynamicQuestionsEnabled={
                    fileSubmissionEnabled && hasPerQuestionDynamic
                  }
                  dynamicGenerationPrompt={dynamicGenerationPrompt}
                  setDynamicGenerationPrompt={setDynamicGenerationPrompt}
                  availableActionKinds={availableActionKinds}
                />
              </TabsContent>
            </Tabs>
      </CollapsibleSection>

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
            disabled={loading}
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

      {/* Error Message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Submit Buttons */}
      <div className="flex justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={(e) => handleSubmit(e, true)}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save as Draft"}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "edit"
              ? initialIsDraft
                ? "Publishing..."
                : "Updating..."
              : "Creating..."
            : mode === "edit"
              ? initialIsDraft
                ? "Publish"
                : "Update Assignment"
              : "Create Assignment"}
        </Button>
      </div>
    </form>
  );
}
