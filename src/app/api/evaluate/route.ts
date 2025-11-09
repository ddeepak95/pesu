import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase";
import { SubmissionAttempt, QuestionAnswers } from "@/types/submission";
import { supportedLanguages } from "@/utils/supportedLanguages";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the structured output schema
// Note: We only ask LLM for rubric_scores and overall_feedback
// total_score and max_score are calculated programmatically
const evaluationSchema = {
  type: "object",
  properties: {
    rubric_scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          points_earned: { type: "number" },
          points_possible: { type: "number" },
          feedback: { type: "string" },
        },
        required: ["item", "points_earned", "points_possible", "feedback"],
        additionalProperties: false,
      },
    },
    overall_feedback: { type: "string" },
  },
  required: ["rubric_scores", "overall_feedback"],
  additionalProperties: false,
};

interface EvaluateRequestBody {
  submissionId: string;
  questionOrder: number;
  answerText: string;
  questionPrompt: string;
  rubric: Array<{ item: string; points: number }>;
  language: string; // Language code for feedback (e.g., "en", "hi", "kn")
}

interface LLMRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}

interface LLMEvaluationResult {
  rubric_scores: LLMRubricScore[];
  overall_feedback: string;
}

export async function POST(request: NextRequest) {
  console.log("=== Evaluation API called ===");
  
  try {
    const body: EvaluateRequestBody = await request.json();
    console.log("Request body received:", {
      submissionId: body.submissionId,
      questionOrder: body.questionOrder,
      answerTextLength: body.answerText?.length,
      rubricItems: body.rubric?.length,
      language: body.language,
    });

    const {
      submissionId,
      questionOrder,
      answerText,
      questionPrompt,
      rubric,
      language,
    } = body;

    // Validate required fields
    if (
      !submissionId ||
      questionOrder === undefined ||
      !answerText ||
      !questionPrompt ||
      !rubric ||
      !language
    ) {
      console.error("Validation failed - missing fields:", {
        hasSubmissionId: !!submissionId,
        hasQuestionOrder: questionOrder !== undefined,
        hasAnswerText: !!answerText,
        hasQuestionPrompt: !!questionPrompt,
        hasRubric: !!rubric,
        hasLanguage: !!language,
      });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build language mapping from supportedLanguages for single source of truth
    const languageNames = Object.fromEntries(
      supportedLanguages.map((lang) => [lang.code, lang.name])
    );
    const languageName = languageNames[language] || "English";

    // Prepare rubric text for the prompt
    const rubricText = rubric
      .map((item) => `- ${item.item} (${item.points} points)`)
      .join("\n");

    const maxScore = rubric.reduce((sum, item) => sum + item.points, 0);
    console.log("Max score calculated:", maxScore);
    console.log("Calling OpenAI for evaluation...");

    // Call OpenAI with structured output
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06", // Model that supports structured outputs
      messages: [
        {
          role: "system",
          content: `You are an expert educational evaluator. Your task is to grade student responses based on provided rubric criteria. Be fair, constructive, and encouraging in your feedback. Evaluate based solely on the content of the student's answer.

IMPORTANT: All feedback must be provided in ${languageName}. Write your evaluation feedback naturally in ${languageName} to help the student understand their performance.`,
        },
        {
          role: "user",
          content: `Question: ${questionPrompt}

Evaluation Rubric:
${rubricText}

Student's Answer:
${answerText}

Please evaluate this answer according to the rubric. For each rubric item:
1. Assign points earned (0 to the maximum points for that item - do not exceed the maximum)
2. Set points_possible to match the rubric item's maximum points
3. Provide specific, constructive feedback in ${languageName}

Then provide overall feedback in ${languageName} that is encouraging and helps the student understand their strengths and areas for improvement.

Remember: All feedback text must be written in ${languageName}.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "evaluation_result",
          strict: true,
          schema: evaluationSchema,
        },
      },
    });

    console.log("OpenAI response received");
    
    const evaluationResult: LLMEvaluationResult = JSON.parse(
      completion.choices[0].message.content || "{}"
    );
    console.log("Parsed evaluation result:", evaluationResult);

    // Validate and cap rubric scores to not exceed max points
    const validatedRubricScores = evaluationResult.rubric_scores.map(
      (score: LLMRubricScore, index: number) => {
        const rubricItem = rubric[index];
        // Ensure points_earned doesn't exceed points_possible
        const pointsEarned = Math.min(
          Math.max(0, score.points_earned), // Ensure non-negative
          rubricItem.points // Cap at max points
        );
        return {
          item: score.item || rubricItem.item,
          points_earned: pointsEarned,
          points_possible: rubricItem.points,
          feedback: score.feedback || "",
        };
      }
    );

    // Calculate total_score and max_score programmatically
    const totalScore = validatedRubricScores.reduce(
      (sum: number, item: LLMRubricScore) => sum + item.points_earned,
      0
    );

    // Get current submission to determine attempt number
    const supabase = createClient();
    const { data: currentSubmission, error: fetchError } = await supabase
      .from("submissions")
      .select("answers")
      .eq("submission_id", submissionId)
      .single();

    if (fetchError) {
      console.error("Error fetching submission:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch submission" },
        { status: 500 }
      );
    }

    // Determine attempt number and build new attempt
    let answers = currentSubmission.answers as
      | { [key: number]: QuestionAnswers }
      | Array<{ question_order: number; answer_text: string }>;

    // Convert old format to new format if needed
    if (Array.isArray(answers)) {
      const newAnswers: { [key: number]: QuestionAnswers } = {};
      answers.forEach((answer) => {
        newAnswers[answer.question_order] = {
          attempts: [],
          selected_attempt: undefined,
        };
      });
      answers = newAnswers;
    }

    const questionAnswers = answers[questionOrder] || { attempts: [] };
    const attemptNumber = (questionAnswers.attempts?.length || 0) + 1;

    const newAttempt: SubmissionAttempt = {
      attempt_number: attemptNumber,
      answer_text: answerText,
      score: totalScore, // Calculated programmatically
      max_score: maxScore, // Calculated from rubric
      rubric_scores: validatedRubricScores, // Validated scores
      evaluation_feedback: evaluationResult.overall_feedback,
      timestamp: new Date().toISOString(),
    };

    // Add new attempt to the question's attempts
    questionAnswers.attempts = [...(questionAnswers.attempts || []), newAttempt];

    // Auto-select best attempt
    if (!questionAnswers.selected_attempt) {
      const bestAttempt = questionAnswers.attempts.reduce((best, current) =>
        current.score > best.score ? current : best
      );
      questionAnswers.selected_attempt = bestAttempt.attempt_number;
    }

    // Update submission in database
    answers[questionOrder] = questionAnswers;

    const { data: updatedSubmission, error: updateError } = await supabase
      .from("submissions")
      .update({
        answers: answers,
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", submissionId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating submission:", updateError);
      return NextResponse.json(
        { error: "Failed to save evaluation" },
        { status: 500 }
      );
    }

    console.log("Returning success response with attempt:", {
      attemptNumber: newAttempt.attempt_number,
      score: newAttempt.score,
      maxScore: newAttempt.max_score,
    });

    return NextResponse.json({
      success: true,
      attempt: newAttempt,
      submission: updatedSubmission,
    });
  } catch (error) {
    console.error("=== Evaluation error ===");
    console.error("Error:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");
    
    return NextResponse.json(
      {
        error: "Failed to evaluate answer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

