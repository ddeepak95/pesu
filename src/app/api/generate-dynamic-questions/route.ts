import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import {
  Question,
  RubricItem,
  DynamicGenerationSpec,
  parseDynamicGenerationSpec,
  isCompleteDynamicGenerationSpec,
} from "@/types/assignment";
import { computeDenormalizedFields } from "@/lib/queries/submissions";
import { QuestionEvaluations } from "@/types/submission";
import {
  buildDefaultDynamicGenerationPrompt,
  formatGenerationSpecForPrompt,
} from "@/lib/promptTemplates";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Interpolate template variables and conditional blocks into a prompt string.
 * Supports {{variable}} and {{#if variable}}...{{/if}} syntax.
 */
function interpolateTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;

  // Process {{#if var}}...{{/if}} conditional blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName: string, content: string) => {
      const value = variables[varName];
      return value && value.trim() ? content : "";
    },
  );

  // Replace {{variable}} placeholders
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

function buildGeneratedQuestionsJsonSchema(questionCount: number) {
  const questionItemSchema = {
    type: "object" as const,
    properties: {
      question_index: {
        type: "number" as const,
        description: `The 0-based index of this question (0 through ${questionCount - 1})`,
      },
      prompt: {
        type: "string" as const,
        description: "The question text to ask the student",
      },
      rubric: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            item: { type: "string" as const },
            points: { type: "number" as const },
          },
          required: ["item", "points"] as const,
          additionalProperties: false,
        },
      },
      expected_answer: {
        type: "string" as const,
        description:
          "Key points the answer should cover (for AI evaluation reference)",
      },
    },
    required: [
      "question_index",
      "prompt",
      "rubric",
      "expected_answer",
    ] as const,
    additionalProperties: false,
  };

  return {
    type: "object" as const,
    properties: {
      questions: {
        type: "array" as const,
        minItems: questionCount,
        maxItems: questionCount,
        items: questionItemSchema,
      },
    },
    required: ["questions"] as const,
    additionalProperties: false,
  };
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
  const currentSum = rubric.reduce((sum, r) => sum + r.points, 0);
  if (currentSum === targetTotal) return rubric;
  if (currentSum === 0) {
    const perItem = Math.floor(targetTotal / rubric.length);
    const remainder = targetTotal - perItem * rubric.length;
    return rubric.map((r, i) => ({
      ...r,
      points: perItem + (i < remainder ? 1 : 0),
    }));
  }

  const scale = targetTotal / currentSum;
  const scaled = rubric.map((r) => ({
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

async function generateAllQuestions(
  spec: DynamicGenerationSpec,
  fileContent: string,
  context: {
    title: string;
    instructions?: string;
    sharedContext?: string;
  },
  customPromptTemplate?: string | null,
): Promise<
  { prompt: string; rubric: RubricItem[]; expected_answer: string }[]
> {
  const truncatedContent = fileContent.slice(0, 50000);
  const n = spec.question_count;
  const points = spec.points_per_question;

  const template = customPromptTemplate?.trim() || buildDefaultDynamicGenerationPrompt();

  const templateVariables: Record<string, string> = {
    title: context.title || "",
    instructions: context.instructions || "",
    context_for_ai: context.sharedContext || "",
    file_submissions: truncatedContent,
    generation_spec: formatGenerationSpecForPrompt(spec),
  };

  const systemMessage = interpolateTemplate(template, templateVariables);

  console.log("systemMessage", systemMessage);

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: `Generate exactly ${n} question(s) as specified in the system instructions. Each rubric must sum to ${points} points.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generated_questions",
        strict: true,
        schema: buildGeneratedQuestionsJsonSchema(n),
      },
    },
  });

  const result = JSON.parse(
    completion.choices[0].message.content || '{"questions":[]}',
  ) as {
    questions: {
      question_index: number;
      prompt: string;
      rubric: RubricItem[];
      expected_answer: string;
    }[];
  };

  const fallbackPrompt = (i: number) =>
    `Answer the following based on your submission, addressing: ${spec.coverage_description.slice(0, 200)}${spec.coverage_description.length > 200 ? "…" : ""} (Question ${i + 1} of ${n})`;

  const output: {
    prompt: string;
    rubric: RubricItem[];
    expected_answer: string;
  }[] = [];

  for (let i = 0; i < n; i++) {
    const match =
      result.questions.find((q) => q.question_index === i) ??
      result.questions[i];

    if (!match) {
      output.push({
        prompt: fallbackPrompt(i),
        rubric: [{ item: spec.coverage_description.slice(0, 120), points }],
        expected_answer: "",
      });
      continue;
    }

    const rawRubric = match.rubric.filter(
      (r) => r.item?.trim() && r.points > 0,
    );
    const normalizedRubric = normalizeRubricPoints(
      rawRubric.length > 0
        ? rawRubric
        : [{ item: spec.coverage_description.slice(0, 120), points }],
      points,
    );

    output.push({
      prompt: match.prompt?.trim() || fallbackPrompt(i),
      rubric: normalizedRubric,
      expected_answer: match.expected_answer?.trim() || "",
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

    // Fetch the assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select(
        "title, student_instructions, shared_context, shared_context_enabled, dynamic_question_focuses, dynamic_generation_prompt",
      )
      .eq("assignment_id", assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    const spec = parseDynamicGenerationSpec(
      assignment.dynamic_question_focuses,
    );
    if (!spec || !isCompleteDynamicGenerationSpec(spec)) {
      return NextResponse.json(
        { error: "Invalid or incomplete dynamic generation settings on assignment" },
        { status: 400 },
      );
    }

    // Fetch submission to check for existing generated questions
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

    // Idempotency: cache only when files still match the generation snapshot
    if (hasGeneratedQuestions && !force && filesMatch) {
      return NextResponse.json({
        questions: submission.generated_questions,
        cached: true,
        generated_from_file_ids: normalizeFileIds(
          snapshotIds ?? submissionFileIds ?? [],
        ),
      });
    }

    // Regenerate (or first run after mismatch): clear stale questions / attempts
    if (hasGeneratedQuestions && (force || !filesMatch)) {
      const emptyEvals: Record<number, QuestionEvaluations> = {};
      const denormalized = computeDenormalizedFields(emptyEvals);

      await supabase
        .from("submissions")
        .update({
          evaluations: emptyEvals,
          generated_questions: null,
          generated_from_file_ids: null,
          questions_generated_at: null,
          ...denormalized,
          updated_at: new Date().toISOString(),
        })
        .eq("submission_id", submissionId);

      // Clean up related tables
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

    // Fetch file content
    const fileContent = await fetchSubmissionFileContent(supabase, submissionId);
    if (!fileContent) {
      return NextResponse.json(
        { error: "No processed file content available. Please wait for file processing to complete." },
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

    // Generate all questions in a single LLM call
    const results = await generateAllQuestions(
      spec,
      fileContent,
      context,
      assignment.dynamic_generation_prompt as string | null,
    );

    const generatedQuestions: Question[] = results.map((result, index) => ({
      order: index,
      prompt: result.prompt,
      total_points: spec.points_per_question,
      rubric: result.rubric,
      supporting_content: "",
      expected_answer: result.expected_answer,
    }));

    console.log("generatedQuestions", generatedQuestions);

    const persistedFileIds = normalizeFileIds(submissionFileIds);

    // Save to submission
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
