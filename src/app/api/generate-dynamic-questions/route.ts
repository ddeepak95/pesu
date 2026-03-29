import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import { DynamicQuestionFocus, Question, RubricItem } from "@/types/assignment";
import { computeDenormalizedFields } from "@/lib/queries/submissions";
import { QuestionEvaluations } from "@/types/submission";
import { buildDefaultDynamicGenerationPrompt } from "@/lib/promptTemplates";

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

const allQuestionsSchema = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          focus_index: {
            type: "number" as const,
            description: "The 0-based index of the focus area this question addresses",
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
          "focus_index",
          "prompt",
          "rubric",
          "expected_answer",
        ] as const,
        additionalProperties: false,
      },
    },
  },
  required: ["questions"] as const,
  additionalProperties: false,
};

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
  focuses: DynamicQuestionFocus[],
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

  const focusDescriptions = focuses
    .map(
      (f, i) =>
        `  ${i}. Focus: "${f.focus}" — ${f.points} points (create 3-5 rubric items summing to exactly ${f.points})`,
    )
    .join("\n");

  const template = customPromptTemplate?.trim() || buildDefaultDynamicGenerationPrompt();

  const templateVariables: Record<string, string> = {
    title: context.title || "",
    instructions: context.instructions || "",
    context_for_ai: context.sharedContext || "",
    file_submissions: truncatedContent,
    focus_areas: focusDescriptions,
  };

  const systemMessage = interpolateTemplate(template, templateVariables);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-2024-08-06",
    messages: [
      {
        role: "system",
        content: systemMessage,
      },
      {
        role: "user",
        content: `Generate ${focuses.length} question(s) based on the focus areas and file submission described in the system instructions.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "generated_questions",
        strict: true,
        schema: allQuestionsSchema,
      },
    },
  });

  const result = JSON.parse(
    completion.choices[0].message.content || '{"questions":[]}',
  ) as {
    questions: {
      focus_index: number;
      prompt: string;
      rubric: RubricItem[];
      expected_answer: string;
    }[];
  };

  // Build output ordered by focus index, falling back to array position
  const output: {
    prompt: string;
    rubric: RubricItem[];
    expected_answer: string;
  }[] = [];

  for (let i = 0; i < focuses.length; i++) {
    const match =
      result.questions.find((q) => q.focus_index === i) ??
      result.questions[i];

    if (!match) {
      // LLM returned fewer questions than expected — use focus text as fallback
      output.push({
        prompt: focuses[i].focus,
        rubric: [{ item: focuses[i].focus, points: focuses[i].points }],
        expected_answer: "",
      });
      continue;
    }

    const normalizedRubric = normalizeRubricPoints(
      match.rubric.filter((r) => r.item?.trim() && r.points > 0),
      focuses[i].points,
    );

    output.push({
      prompt: match.prompt?.trim() || focuses[i].focus,
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

    const focuses = assignment.dynamic_question_focuses as
      | DynamicQuestionFocus[]
      | null;
    if (!focuses || focuses.length === 0) {
      return NextResponse.json(
        { error: "No dynamic question focuses configured" },
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

    // Idempotency: return existing generated questions unless force is set
    if (submission.generated_questions && !force) {
      return NextResponse.json({
        questions: submission.generated_questions,
        cached: true,
      });
    }

    // If force is set, clear existing evaluations and related data
    if (force && submission.generated_questions) {
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
      focuses,
      fileContent,
      context,
      assignment.dynamic_generation_prompt as string | null,
    );

    // Assemble Question[] with order
    const generatedQuestions: Question[] = results.map((result, index) => ({
      order: index,
      prompt: result.prompt,
      total_points: focuses[index].points,
      rubric: result.rubric,
      supporting_content: "",
      expected_answer: result.expected_answer,
    }));

    // Save to submission
    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        generated_questions: generatedQuestions,
        generated_from_file_ids: submission.file_ids || [],
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
