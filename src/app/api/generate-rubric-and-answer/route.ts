import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { RubricItem } from "@/types/assignment";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateRubricAndAnswerRequestBody {
  questionPrompt: string;
  supportingContent?: string;
  language?: string; // Optional - used as fallback
}

interface GenerateRubricAndAnswerResponse {
  rubric: RubricItem[];
  expectedAnswer: string;
}

// Define the structured output schema with detected_language
const generationSchema = {
  type: "object",
  properties: {
    detected_language: {
      type: "string",
      description:
        "ISO 639-1 language code detected from the prompt (e.g., 'en', 'hi', 'kn', 'ta', 'ml', 'de')",
    },
    rubric: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          points: { type: "number" },
        },
        required: ["item", "points"],
        additionalProperties: false,
      },
    },
    expected_answer: { type: "string" },
  },
  required: ["detected_language", "rubric", "expected_answer"],
  additionalProperties: false,
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRubricAndAnswerRequestBody = await request.json();

    const { questionPrompt, supportingContent, language } = body;

    // Validate required fields
    if (!questionPrompt) {
      return NextResponse.json(
        { error: "Missing required field: questionPrompt is required" },
        { status: 400 }
      );
    }

    // Build language mapping from supportedLanguages
    const languageNames = Object.fromEntries(
      supportedLanguages.map((lang) => [lang.code, lang.name])
    );
    const supportedLanguageCodes = supportedLanguages.map((lang) => lang.code);
    const preferredLanguageName = language
      ? languageNames[language] || "English"
      : "English";

    // Build context for the prompt
    let contextText = `Question: ${questionPrompt}`;
    if (supportingContent && supportingContent.trim()) {
      contextText += `\n\nSupporting Content:\n${supportingContent}`;
    }

    // Single OpenAI call that detects language and generates content
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-2024-08-06", // Model that supports structured outputs
      messages: [
        {
          role: "system",
          content: `You are an expert educational content creator. Your task is to:
1. First, identify the language of the question prompt
2. Then generate a comprehensive rubric and expected answer in that same language

IMPORTANT: 
- Detect the language from the question prompt
- Generate ALL content (rubric items and expected answer) in the detected language
- If you cannot confidently detect the language, use the preferred language provided as fallback
- Write naturally in the detected language

For the rubric:
- Generate 3-5 rubric items that comprehensively cover what a good answer should include
- Distribute points appropriately (typically 20-40 points per item, with total points between 60-100)
- Make rubric items specific, measurable, and aligned with the question
- Each rubric item should describe a distinct aspect of a quality answer
- Write rubric items in the detected language

For the expected answer:
- Provide key points that the answer should definitely cover (as bullet points)
- Keep it concise - just the essential elements
- Format as clear, actionable pointers
- This guides AI evaluation, not a sample answer for students
- Write in the detected language`,
        },
        {
          role: "user",
          content: `${contextText}

Preferred Language (fallback if detection uncertain): ${preferredLanguageName}

Please:
1. Detect the language of the question (respond with ISO 639-1 code: en, hi, kn, ta, ml, or de)
2. Generate a rubric with 3-5 items in the detected language
3. Generate expected answer as key pointers in the detected language`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rubric_and_answer",
          strict: true,
          schema: generationSchema,
        },
      },
    });

    const result = JSON.parse(
      completion.choices[0].message.content || "{}"
    ) as {
      detected_language: string;
      rubric: RubricItem[];
      expected_answer: string;
    };

    // Validate detected language code
    let detectedLang = result.detected_language?.toLowerCase().trim();
    if (!detectedLang || !supportedLanguageCodes.includes(detectedLang)) {
      // Fallback to preferred language or English
      detectedLang = language || "en";
      if (!supportedLanguageCodes.includes(detectedLang)) {
        detectedLang = "en";
      }
    }

    // Validate and ensure rubric items have valid points
    const validatedRubric = result.rubric
      .filter((item) => item.item && item.item.trim() && item.points > 0)
      .map((item) => ({
        item: item.item.trim(),
        points: Math.max(1, Math.round(item.points)), // Ensure at least 1 point and round to integer
      }));

    // Ensure we have at least 2 rubric items
    if (validatedRubric.length < 2) {
      // Fallback: create a simple rubric if AI didn't generate enough items
      validatedRubric.push(
        {
          item: "Completeness and accuracy of response",
          points: 30,
        },
        {
          item: "Clarity and organization of explanation",
          points: 20,
        }
      );
    }

    const response: GenerateRubricAndAnswerResponse = {
      rubric: validatedRubric,
      expectedAnswer: result.expected_answer?.trim() || "",
    };

    console.log(
      `Generated rubric and answer in detected language: ${detectedLang} (${languageNames[detectedLang] || "Unknown"})`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Generate rubric and answer API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate rubric and expected answer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
