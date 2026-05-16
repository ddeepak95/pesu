import { NextRequest, NextResponse } from "next/server";
import { supportedLanguages } from "@/utils/supportedLanguages";
import type { RubricItem } from "@/types/assignment";
import { getDefaultModelConfigFromEnv } from "@/lib/ai/config";
import { AiNotConfiguredError } from "@/lib/ai/credentials/resolve";
import { resolveCatalogModelConfigForPlatform } from "@/lib/ai/catalog/resolveRuntime";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";
import {
  rubricGenerationSchema,
  rubricOnlySchema,
  expectedOnlySchema,
} from "@/lib/ai/schemas/rubric-generation";
import { generateStructured } from "@/lib/ai/structured";

interface GenerateRubricAndAnswerRequestBody {
  questionPrompt: string;
  supportingContent?: string;
  language?: string;
  title?: string;
  instructions?: string;
  contextForAI?: string;
  focusGuidance?: string;
  /** Default true. When false, rubric is not generated. */
  generateRubric?: boolean;
  /** Default true. When false, expected answer is not generated. */
  generateExpectedAnswer?: boolean;
}

interface GenerateRubricAndAnswerResponse {
  rubric: RubricItem[];
  expectedAnswer: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRubricAndAnswerRequestBody = await request.json();

    const {
      questionPrompt,
      supportingContent,
      language,
      title,
      instructions,
      contextForAI,
      focusGuidance,
      generateRubric = true,
      generateExpectedAnswer = true,
    } = body;

    if (!questionPrompt) {
      return NextResponse.json(
        { error: "Missing required field: questionPrompt is required" },
        { status: 400 },
      );
    }

    if (!generateRubric && !generateExpectedAnswer) {
      return NextResponse.json(
        {
          error:
            "At least one of generateRubric or generateExpectedAnswer must be true",
        },
        { status: 400 },
      );
    }

    const languageNames = Object.fromEntries(
      supportedLanguages.map((lang) => [lang.code, lang.name]),
    );
    const supportedLanguageCodes = supportedLanguages.map((lang) => lang.code);
    const preferredLanguageName = language
      ? languageNames[language] || "English"
      : "English";

    let contextText = "";
    if (title?.trim()) {
      contextText += `Assignment Title: ${title.trim()}\n\n`;
    }
    if (instructions?.trim()) {
      contextText += `Assignment Instructions: ${instructions.trim()}\n\n`;
    }
    if (contextForAI?.trim()) {
      contextText += `Additional Context: ${contextForAI.trim()}\n\n`;
    }
    contextText += `Question: ${questionPrompt}`;
    if (supportingContent?.trim()) {
      contextText += `\n\nSupporting Content:\n${supportingContent}`;
    }
    if (focusGuidance?.trim()) {
      contextText += `\n\nTeacher's Additional Instructions for Generation:\n${focusGuidance.trim()}`;
    }

    let config = getDefaultModelConfigFromEnv();
    try {
      const resolved = await resolveCatalogModelConfigForPlatform("text");
      config = resolved.config;
    } catch (error) {
      if (!(error instanceof AiNotConfiguredError)) {
        throw error;
      }
    }
    const model = getLanguageModel(config);
    const providerOptions = providerOptionsForConfig(config);

    const baseUser = `${contextText}

Preferred Language (fallback if detection uncertain): ${preferredLanguageName}`;

    let validatedRubric: RubricItem[] = [];
    let expectedAnswer = "";
    let detectedLang = language || "en";

    if (generateRubric && generateExpectedAnswer) {
      const result = await generateStructured({
        model,
        schema: rubricGenerationSchema,
        providerOptions,
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
- You may receive additional context such as the assignment title, instructions, contextual information, and teacher's additional instructions. Use all available context to produce more relevant and aligned rubric items and expected answers.

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
            content: `${baseUser}

Please:
1. Detect the language of the question (respond with ISO 639-1 code: en, hi, kn, ta, ml, or de)
2. Generate a rubric with 3-5 items in the detected language
3. Generate expected answer as key pointers in the detected language`,
          },
        ],
      });

      let dl = result.detected_language?.toLowerCase().trim();
      if (!dl || !supportedLanguageCodes.includes(dl)) {
        dl = language || "en";
        if (!supportedLanguageCodes.includes(dl)) {
          dl = "en";
        }
      }
      detectedLang = dl;

      validatedRubric = result.rubric
        .filter((item) => item.item && item.item.trim() && item.points > 0)
        .map((item) => ({
          item: item.item.trim(),
          points: Math.max(1, Math.round(item.points)),
        }));

      if (validatedRubric.length < 2) {
        validatedRubric.push(
          { item: "Completeness and accuracy of response", points: 30 },
          { item: "Clarity and organization of explanation", points: 20 },
        );
      }

      expectedAnswer = result.expected_answer?.trim() || "";
    } else if (generateRubric) {
      const result = await generateStructured({
        model,
        schema: rubricOnlySchema,
        providerOptions,
        messages: [
          {
            role: "system",
            content: `You are an expert educational content creator. Detect the language of the question, then generate ONLY a rubric in that language (3-5 items). Use assignment context when provided. Distribute points so the total is reasonable for classroom use (e.g. 60-100 total).`,
          },
          {
            role: "user",
            content: `${baseUser}

Please detect language (ISO 639-1) and generate only the rubric.`,
          },
        ],
      });

      let dl = result.detected_language?.toLowerCase().trim();
      if (!dl || !supportedLanguageCodes.includes(dl)) {
        dl = language || "en";
        if (!supportedLanguageCodes.includes(dl)) {
          dl = "en";
        }
      }
      detectedLang = dl;

      validatedRubric = result.rubric
        .filter((item) => item.item && item.item.trim() && item.points > 0)
        .map((item) => ({
          item: item.item.trim(),
          points: Math.max(1, Math.round(item.points)),
        }));

      if (validatedRubric.length < 2) {
        validatedRubric.push(
          { item: "Completeness and accuracy of response", points: 30 },
          { item: "Clarity and organization of explanation", points: 20 },
        );
      }
    } else {
      const result = await generateStructured({
        model,
        schema: expectedOnlySchema,
        providerOptions,
        messages: [
          {
            role: "system",
            content: `You are an expert educational content creator. Detect the language of the question, then generate ONLY an expected answer key (bullet-style key points the student's answer should cover). This guides AI evaluation, not a sample for students.`,
          },
          {
            role: "user",
            content: `${baseUser}

Please detect language (ISO 639-1) and generate only the expected answer key points.`,
          },
        ],
      });

      let dl = result.detected_language?.toLowerCase().trim();
      if (!dl || !supportedLanguageCodes.includes(dl)) {
        dl = language || "en";
        if (!supportedLanguageCodes.includes(dl)) {
          dl = "en";
        }
      }
      detectedLang = dl;

      expectedAnswer = result.expected_answer?.trim() || "";
    }

    const response: GenerateRubricAndAnswerResponse = {
      rubric: validatedRubric,
      expectedAnswer,
    };

    console.log(
      `Generated rubric/answer (rubric=${generateRubric}, expected=${generateExpectedAnswer}) in ${detectedLang} (${languageNames[detectedLang] || "Unknown"})`,
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Generate rubric and answer API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate rubric and expected answer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
