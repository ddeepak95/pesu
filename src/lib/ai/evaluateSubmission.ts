/**
 * Shared LLM evaluation helper used by src/app/api/evaluate/route.ts.
 *
 * Accepts an already-resolved LanguageModel so callers control which
 * provider and key are used (env defaults today; user config via BYOK later).
 */

import type { LanguageModelV3, SharedV3ProviderOptions } from "@ai-sdk/provider";
import { buildEvaluationSystemMessage } from "@/lib/activityTypes/registry";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { supportedLanguages } from "@/utils/supportedLanguages";
import {
  feedbackDocFromText,
  flattenFeedbackDoc,
  validateFeedbackDoc,
  type FeedbackDoc,
} from "@/types/feedbackDoc";
import {
  evaluationSchema,
  type EvaluationResult,
  type LLMRubricScore,
} from "./schemas/evaluation";
import { generateStructured } from "./structured";
import type { StartAiInvocationInput } from "./logging/types";

/** Validation-driven regenerations of feedback_doc (on top of provider retries). */
const MAX_FEEDBACK_DOC_ATTEMPTS = 2;

const FEEDBACK_DOC_CORRECTIVE_NOTE = `

IMPORTANT CORRECTION: Your previous response contained an invalid feedback_doc. Regenerate it strictly as { "version": 1, "blocks": [...] }, where every block has "kind": "section" with a "title" (string) and "content" (string). Do not invent other fields or block kinds, do not include the rubric scores, and keep all text plain (no markdown).`;

export interface EvaluateSubmissionParams {
  model: LanguageModelV3;
  providerOptions?: SharedV3ProviderOptions;
  questionPrompt: string;
  answerText: string;
  rubric: Array<{ item: string; points: number }>;
  language: string;
  sharedContext?: string;
  customEvaluationPrompt?: string;
  /** Teacher's free-text "Feedback focus" — steers the AI's dynamic section titles. */
  feedbackFocus?: string;
  activityType?: ActivityTypeKind;
  invocation?: Omit<StartAiInvocationInput, "sdkRequest" | "retryOf" | "retryIndex">;
}

export interface ValidatedRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

export interface EvaluationOutput {
  validatedRubricScores: ValidatedRubricScore[];
  /** Flattened plain-text rendering of feedbackDoc (kept for fallback/search). */
  overallFeedback: string;
  /** Structured block document — always valid (self-healed or paragraph fallback). */
  feedbackDoc: FeedbackDoc;
  totalScore: number;
  maxScore: number;
}

export async function evaluateSubmission(
  params: EvaluateSubmissionParams,
): Promise<EvaluationOutput> {
  const {
    model,
    questionPrompt,
    answerText,
    rubric,
    language,
    sharedContext,
    customEvaluationPrompt,
    feedbackFocus,
    activityType,
    providerOptions,
    invocation,
  } = params;

  const maxScore = rubric.reduce((sum, item) => sum + item.points, 0);
  const rubricText = rubric
    .map((item) => `- ${item.item} (${item.points} points)`)
    .join("\n");

  const languageNames = Object.fromEntries(
    supportedLanguages.map((lang) => [lang.code, lang.name]),
  );
  const languageName = languageNames[language] || "English";

  let userMessageContent: string;
  if (customEvaluationPrompt) {
    userMessageContent = customEvaluationPrompt;
  } else {
    const sharedContextSection = sharedContext
      ? `Additional context:\n${sharedContext}\n\n`
      : "";
    userMessageContent = `${sharedContextSection}Question: ${questionPrompt}

Evaluation Rubric:
${rubricText}

Student's Answer:
${answerText}

Please evaluate this answer according to the rubric. For each rubric item:
1. Assign points earned (0 to the maximum points for that item - do not exceed the maximum)
2. Set points_possible to match the rubric item's maximum points
3. Provide specific, constructive feedback in ${languageName}

Then compose the feedback document (feedback_doc) in ${languageName} that is encouraging and helps the student understand their strengths and areas for improvement.

IMPORTANT: All feedback text must be written in ${languageName}.`;
  }

  // Teacher "Feedback focus" areas steer the AI's sections. The resolved text is
  // a list of `"<title>": <description>` lines; the title drives the section
  // title. Appended regardless of whether a custom evaluation prompt is in use.
  if (feedbackFocus && feedbackFocus.trim()) {
    userMessageContent += `\n\nFEEDBACK FOCUS (from the teacher): Create one feedback_doc "section" per focus area below, using the exact given title as that section's title and addressing its guidance in the section's content. Cover every area; you may add other sections too if helpful.\n${feedbackFocus.trim()}`;
  }

  const systemMessage = buildEvaluationSystemMessage(
    activityType ?? "learning",
  );

  // Generate, then validate feedback_doc against the Zod schema. If it is
  // structurally invalid, regenerate (bounded) with a corrective note appended.
  // Only after exhausting retries do we fall back to wrapping overall_feedback in
  // a single paragraph — so storage/UI never see a malformed document.
  let evaluationResult!: EvaluationResult;
  let feedbackDoc: FeedbackDoc | null = null;
  for (let attempt = 0; attempt < MAX_FEEDBACK_DOC_ATTEMPTS; attempt++) {
    const content =
      attempt === 0
        ? userMessageContent
        : userMessageContent + FEEDBACK_DOC_CORRECTIVE_NOTE;
    evaluationResult = await generateStructured({
      model,
      schema: evaluationSchema,
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content },
      ],
      providerOptions,
      invocation: invocation
        ? { ...invocation, schemaName: "evaluationSchema" }
        : undefined,
    });
    feedbackDoc = validateFeedbackDoc(evaluationResult.feedback_doc);
    if (feedbackDoc) break;
    console.warn(
      `[evaluate] feedback_doc invalid on attempt ${attempt + 1}/${MAX_FEEDBACK_DOC_ATTEMPTS}`,
    );
  }

  // Fallback: wrap the plain-text overall_feedback in a single-paragraph doc.
  if (!feedbackDoc) {
    feedbackDoc = feedbackDocFromText(evaluationResult.overall_feedback ?? "");
  }

  // The flat `feedback` text mirrors the document (fallback render + search).
  const overallFeedback =
    flattenFeedbackDoc(feedbackDoc) || evaluationResult.overall_feedback || "";

  const validatedRubricScores = evaluationResult.rubric_scores.map(
    (score: LLMRubricScore, index: number) => {
      const rubricItem = rubric[index];
      const pointsEarned = Math.min(
        Math.max(0, score.points_earned),
        rubricItem.points,
      );
      return {
        item: score.item || rubricItem.item,
        points_earned: pointsEarned,
        points_possible: rubricItem.points,
        feedback: score.feedback || "",
      };
    },
  );

  const totalScore = validatedRubricScores.reduce(
    (sum, item) => sum + item.points_earned,
    0,
  );

  return {
    validatedRubricScores,
    overallFeedback,
    feedbackDoc,
    totalScore,
    maxScore,
  };
}
