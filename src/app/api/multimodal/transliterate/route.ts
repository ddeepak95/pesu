import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import {
  catalogNotConfiguredResponse,
} from "@/lib/ai/credentials/resolveCatalogConfig";
import { quotaExceededResponse } from "@/lib/ai/metering/quota";
import { resolveMeteredModel, runWithAiContext } from "@/lib/ai/gateway";
import { transliterateMessage } from "@/lib/ai/transliterateMessage";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { AiNotConfiguredError } from "@/lib/ai/credentials/resolve";

interface TransliterateBody {
  text: string;
  fromLanguage: string;
  toLanguage: string;
  assignmentId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<TransliterateBody>;
    const { text, fromLanguage, toLanguage, assignmentId } = body;

    if (!text?.trim() || !fromLanguage || !toLanguage || !assignmentId) {
      return NextResponse.json(
        { error: "Missing required fields: text, fromLanguage, toLanguage, assignmentId" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    return await runWithAiContext({ userId, classId: classDbId }, async () => {
      let handle;
      try {
        handle = await resolveMeteredModel({
          appFunctionKey: "text.transliteration",
          context: { classDbId, assignmentId },
        });
      } catch (error) {
        const notConfigured = catalogNotConfiguredResponse(error);
        if (notConfigured) {
          return NextResponse.json(notConfigured.body, { status: notConfigured.status });
        }
        if (error instanceof AiNotConfiguredError) {
          return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
        }
        const quotaBlocked = quotaExceededResponse(error);
        if (quotaBlocked) {
          return NextResponse.json(quotaBlocked.body, { status: quotaBlocked.status });
        }
        throw error;
      }

      const result = await transliterateMessage({
        handle,
        text,
        fromLanguage,
        toLanguage,
      });

      return NextResponse.json(result);
    });
  } catch (error) {
    console.error("[multimodal/transliterate]", error);
    return NextResponse.json(
      {
        error: "Failed to transliterate message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
