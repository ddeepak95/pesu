import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import {
  Question,
  RubricItem,
  assignmentHasDynamicQuestionParts,
  teacherPromptOrFocus,
} from "@/types/assignment";
import {
  buildDefaultDynamicGenerationPrompt,
  buildDynamicGenerationUserMessage,
  formatQuestionsForDynamicGenerationPrompt,
} from "@/lib/promptTemplates";
import { getActivityTypeDefinition } from "@/lib/activityTypes/registry";
import type { ActivityTypeKind } from "@/lib/activityTypes/types";
import { buildGeneratedQuestionsSchema } from "@/lib/ai/schemas/dynamic-questions";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { resolveMeteredModel, type MeteredTextModel } from "@/lib/ai/gateway";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";

/**
 * Interpolate template variables and conditional blocks into a prompt string.
 * Supports {{variable}} and {{#if variable}}...{{/if}} syntax.
 */
function interpolateTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;

  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName: string, content: string) => {
      const value = variables[varName];
      return value && value.trim() ? content : "";
    },
  );

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }

  return result;
}

interface GenerateDynamicQuestionsRequestBody {
  submissionId: string;
  assignmentId: string;
  force?: boolean;
}

function normalizeFileIds(ids: string[] | null | undefined): string[] {
  return Array.from(new Set((ids ?? []).filter(Boolean))).sort();
}

function fileSetsMatch(
  current: string[] | null | undefined,
  snapshot: string[] | null | undefined,
): boolean {
  const a = normalizeFileIds(current);
  const b = normalizeFileIds(snapshot);
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

async function fetchSubmissionFileContent(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  submissionId: string,
): Promise<string> {
  const { data: files, error } = await supabase
    .from("submission_files")
    .select("id, filename, parsed_content_url, processing_status")
    .eq("submission_id", submissionId)
    .eq("processing_status", "processed")
    .not("parsed_content_url", "is", null);

  if (error || !files || files.length === 0) return "";

  const bucket = getStorageBucket();
  const sections: string[] = [];

  for (const file of files) {
    try {
      const url = new URL(file.parsed_content_url);
      const storagePath = url.pathname.replace(`/${bucket.name}/`, "");
      const [buffer] = await bucket.file(storagePath).download();
      const markdown = buffer.toString("utf-8");
      sections.push(`### ${file.filename}\n${markdown}`);
    } catch {
      console.warn(`Failed to download parsed content for file ${file.id}`);
    }
  }

  if (sections.length === 0) return "";
  return sections.join("\n\n");
}

function normalizeRubricPoints(
  rubric: RubricItem[],
  targetTotal: number,
): RubricItem[] {
  const valid = rubric.filter((r) => r.item?.trim() && r.points > 0);
  if (valid.length === 0) {
    return [{ item: "Response quality", points: targetTotal }];
  }
  const currentSum = valid.reduce((sum, r) => sum + r.points, 0);
  if (currentSum === targetTotal) return valid;
  if (currentSum === 0) {
    const perItem = Math.floor(targetTotal / valid.length);
    const remainder = targetTotal - perItem * valid.length;
    return valid.map((r, i) => ({
      ...r,
      points: perItem + (i < remainder ? 1 : 0),
    }));
  }

  const scale = targetTotal / currentSum;
  const scaled = valid.map((r) => ({
    ...r,
    points: Math.max(1, Math.round(r.points * scale)),
  }));

  let diff = targetTotal - scaled.reduce((s, r) => s + r.points, 0);
  let idx = 0;
  while (diff !== 0) {
    const delta = diff > 0 ? 1 : -1;
    if (scaled[idx].points + delta >= 1) {
      scaled[idx].points += delta;
      diff -= delta;
    }
    idx = (idx + 1) % scaled.length;
  }

  return scaled;
}

function sortTemplates(templates: Question[]): Question[] {
  return [...templates].sort((a, b) => a.order - b.order);
}

async function generateMergedQuestions(
  templates: Question[],
  fileContent: string,
  context: {
    title: string;
    instructions?: string;
    sharedContext?: string;
  },
  handle: MeteredTextModel,
  customPromptTemplate?: string | null,
  activityType?: ActivityTypeKind,
): Promise<Question[]> {
  const sorted = sortTemplates(templates);
  const n = sorted.length;
  const truncatedContent = fileContent.slice(0, 50000);

  const activityDef = activityType
    ? getActivityTypeDefinition(activityType)
    : undefined;
  const promptTemplateStr =
    customPromptTemplate?.trim() ||
    buildDefaultDynamicGenerationPrompt(activityDef?.generation?.dynamicGenerationGuidance);

  const templateVariables: Record<string, string> = {
    title: context.title || "",
    instructions: context.instructions || "",
    context_for_ai: context.sharedContext || "",
    file_submissions: truncatedContent,
    generation_spec: formatQuestionsForDynamicGenerationPrompt(sorted),
  };

  const systemMessage = interpolateTemplate(promptTemplateStr, templateVariables);

  const schema = buildGeneratedQuestionsSchema(n);

  const result = await handle.generateStructured({
    schema,
    schemaName: "dynamicQuestionsSchema",
    messages: [
      { role: "system", content: systemMessage },
      {
        role: "user",
        content: buildDynamicGenerationUserMessage(n),
      },
    ],
  });

  const output: Question[] = [];

  for (let i = 0; i < n; i++) {
    const t = sorted[i];
    const points = t.total_points;
    const match =
      result.questions.find((q) => q.question_index === i) ??
      result.questions[i];

    const focusOrPrompt = teacherPromptOrFocus(t);
    const fallbackPrompt = () =>
      `Answer based on your submission regarding: ${focusOrPrompt.trim().slice(0, 200)}${focusOrPrompt.length > 200 ? "…" : ""} (Question ${i + 1} of ${n})`;

    const llmPrompt = match?.prompt?.trim() || "";
    const prompt = t.dynamic_prompt ? llmPrompt || fallbackPrompt() : t.prompt;

    let rubric: RubricItem[];
    let expected_answer: string;

    if (t.dynamic_rubric) {
      const rawRubric = (match?.rubric ?? []).filter(
        (r) => r.item?.trim() && r.points > 0,
      );
      rubric = normalizeRubricPoints(
        rawRubric.length > 0
          ? rawRubric
          : [{ item: "Quality of response", points }],
        points,
      );
      expected_answer = match?.expected_answer?.trim() || "";
    } else {
      rubric = normalizeRubricPoints(t.rubric, points);
      expected_answer = (t.expected_answer ?? "").trim();
    }

    output.push({
      order: i,
      prompt,
      total_points: points,
      rubric,
      supporting_content: t.supporting_content ?? "",
      expected_answer,
    });
  }

  return output;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateDynamicQuestionsRequestBody = await request.json();
    const { submissionId, assignmentId, force } = body;

    if (!submissionId || !assignmentId) {
      return NextResponse.json(
        { error: "Missing required fields: submissionId and assignmentId" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select(
        "title, student_instructions, shared_context, shared_context_enabled, questions, dynamic_generation_prompt, activity_type",
      )
      .eq("assignment_id", assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    const templates = (assignment.questions ?? []) as Question[];
    if (!Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json(
        { error: "Assignment has no questions configured" },
        { status: 400 },
      );
    }

    if (!assignmentHasDynamicQuestionParts(templates)) {
      return NextResponse.json(
        {
          error:
            "No dynamic question parts enabled on this assignment",
        },
        { status: 400 },
      );
    }

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select(
        "submission_id, generated_questions, generated_from_file_ids, file_ids",
      )
      .eq("submission_id", submissionId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    const hasGeneratedQuestions = !!submission.generated_questions;
    const submissionFileIds = submission.file_ids as string[] | null | undefined;
    const snapshotIds = submission.generated_from_file_ids as
      | string[]
      | null
      | undefined;
    const filesMatch = fileSetsMatch(submissionFileIds, snapshotIds);

    if (hasGeneratedQuestions && !force && filesMatch) {
      return NextResponse.json({
        questions: submission.generated_questions,
        cached: true,
        generated_from_file_ids: normalizeFileIds(
          snapshotIds ?? submissionFileIds ?? [],
        ),
      });
    }

    if (hasGeneratedQuestions && (force || !filesMatch)) {
      // Files changed → regenerate questions and wipe prior answers. Deleting the
      // normalized question rows cascades to attempts/ai-evals/reviews; the rollup
      // trigger then zeroes the denormalized counters.
      await supabase
        .from("submission_questions")
        .delete()
        .eq("submission_id", submissionId);

      await supabase
        .from("submissions")
        .update({
          generated_questions: null,
          generated_from_file_ids: null,
          questions_generated_at: null,
          feedback_released_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", submissionId);

      await Promise.all([
        supabase
          .from("submission_transcripts")
          .delete()
          .eq("submission_id", submissionId),
        supabase
          .from("chat_messages")
          .delete()
          .eq("submission_id", submissionId),
        supabase
          .from("static_activity")
          .delete()
          .eq("submission_id", submissionId),
      ]);
    }

    const fileContent = await fetchSubmissionFileContent(supabase, submissionId);
    if (!fileContent) {
      return NextResponse.json(
        {
          error:
            "No processed file content available. Please wait for file processing to complete.",
        },
        { status: 422 },
      );
    }

    const context = {
      title: assignment.title,
      instructions: assignment.student_instructions || undefined,
      sharedContext: assignment.shared_context_enabled
        ? assignment.shared_context || undefined
        : undefined,
    };

    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    let handle;
    try {
      handle = await resolveMeteredModel({
        appFunctionKey: "text.dynamic_questions",
        context: { classDbId, assignmentId, submissionId },
      });
    } catch (error) {
      const notConfigured = catalogNotConfiguredResponse(error);
      if (notConfigured) {
        return NextResponse.json(notConfigured.body, {
          status: notConfigured.status,
        });
      }
      throw error;
    }

    const generatedQuestions = await generateMergedQuestions(
      templates,
      fileContent,
      context,
      handle,
      assignment.dynamic_generation_prompt as string | null,
      (assignment.activity_type as ActivityTypeKind) ?? undefined,
    );

    const persistedFileIds = normalizeFileIds(submissionFileIds);

    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        generated_questions: generatedQuestions,
        generated_from_file_ids: persistedFileIds,
        questions_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", submissionId);

    if (updateError) {
      console.error("Error saving generated questions:", updateError);
      return NextResponse.json(
        { error: "Failed to save generated questions" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      questions: generatedQuestions,
      cached: false,
      generated_from_file_ids: persistedFileIds,
    });
  } catch (error) {
    console.error("Generate dynamic questions API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate dynamic questions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
