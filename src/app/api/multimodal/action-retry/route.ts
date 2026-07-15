import { NextRequest, NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import { getLocaleRegistryMap } from "@/lib/locales/registry";
import { dispatchAction } from "@/lib/multimodal/actions/dispatcher";
import { resolveActionModel } from "@/lib/multimodal/actions/resolveActionModel";
import { runWithAiContext } from "@/lib/ai/gateway";
import { actionInputSchema } from "@/lib/multimodal/actions/schema";
import type { ActionPayload } from "@/lib/multimodal/actions/types";
import { classifyAiError } from "@/lib/ai/errors";
import { logAppEvent } from "@/lib/logging/appLog";

interface ActionRetryRequestBody {
  assignmentId: string;
  submissionId?: string | null;
  questionOrder: number;
  questionId: string;
  sessionId?: string | null;
  actionId: string;
  input: unknown;
  chatMessageId: string;
  language: string;
  supportLanguage?: string;
}

/**
 * Manual retry of a single failed action (Call 2) generation, without re-running
 * the whole turn. `generateObject` is non-streaming, so this returns plain JSON.
 * Auth + integrity mirror the turn route; recent conversation is rebuilt from
 * chat_messages server-side (client-sent history is not trusted); the same
 * actionId is reused (persistence upserts on id). See
 * dev-docs/ai-retry-and-failure-recovery-plan.md §6.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ActionRetryRequestBody;
    const {
      assignmentId,
      submissionId,
      questionOrder,
      questionId,
      sessionId,
      actionId,
      chatMessageId,
      language,
      supportLanguage,
    } = body;

    if (
      !assignmentId ||
      questionOrder === undefined ||
      !questionId ||
      !actionId ||
      !chatMessageId ||
      !language?.trim()
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const parsedInput = actionInputSchema.safeParse(body.input);
    if (!parsedInput.success) {
      return NextResponse.json(
        { error: "Invalid action input", code: "BAD_REQUEST", retryable: false },
        { status: 400 },
      );
    }
    const action = parsedInput.data;

    const supabase = await createServerSupabaseClient();

    if (submissionId) {
      const integrityBlock = await assertSubmissionNotIntegrityLocked(
        supabase,
        submissionId,
      );
      if (integrityBlock) return integrityBlock;
    }

    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    return await runWithAiContext({ userId, classId: classDbId }, async () => {
      // Rebuild recent conversation from the DB (do not trust client-sent history).
      const { data: recentRows } = await supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("submission_id", submissionId ?? "")
        .eq("question_id", questionId)
        .order("created_at", { ascending: true });
      const recentMessages = (recentRows ?? [])
        .filter((r) => typeof r.content === "string" && r.content.trim())
        .slice(-6)
        .map((r) => ({
          role: r.role as "student" | "assistant",
          content: r.content as string,
        }));

      const actionHandle = await resolveActionModel({
        context: {
          classDbId,
          assignmentId,
          submissionId,
          questionOrder,
          questionId,
          sessionId: sessionId ?? null,
          relatedEntity: { type: "chat_message_action", id: actionId },
        },
        kind: action.kind,
      });

      const localeLabel = (code: string) =>
        getLocaleRegistryMap().get(code)?.label ?? code;

      // Collector enqueue — capture the action_payload the handler emits.
      let capturedPayload: ActionPayload | null = null;
      const enqueue = (data: Record<string, unknown>) => {
        if (data.type === "action_payload" && data.data) {
          capturedPayload = data.data as ActionPayload;
        }
      };

      try {
        await dispatchAction({
          id: actionId,
          action,
          handle: actionHandle,
          enqueue,
          supabase,
          submissionId: submissionId ?? null,
          chatMessageId,
          languageLabel: localeLabel(language),
          ...(supportLanguage && supportLanguage !== language
            ? { supportLanguageLabel: localeLabel(supportLanguage) }
            : {}),
          recentMessages,
          classId: classDbId,
          assignmentId,
          questionOrder,
          questionId,
          sessionId: sessionId ?? null,
        });
      } catch (err) {
        // dispatchAction already logged the terminal failure with
        // source "multimodal_action"; add an action_retry-scoped row too.
        const classified = classifyAiError(err);
        logAppEvent({
          level: "error",
          source: "action_retry",
          event: "ai_failure",
          errorCode: classified.code,
          message: classified.message,
          classId: classDbId,
          activityId: assignmentId,
          submissionId: submissionId ?? null,
          questionOrder,
          questionId,
          metadata: { kind: action.kind },
        });
        const status =
          classified.code === "RATE_LIMITED"
            ? 429
            : classified.code === "PROVIDER_UNAVAILABLE"
              ? 503
              : 500;
        return NextResponse.json(
          {
            error: classified.message,
            code: classified.code,
            retryable: classified.retryable,
            ...(classified.retryAfterMs
              ? { retryAfterMs: classified.retryAfterMs }
              : {}),
          },
          { status },
        );
      }

      if (!capturedPayload) {
        return NextResponse.json(
          { error: "Action produced no payload", code: "UNKNOWN", retryable: true },
          { status: 500 },
        );
      }

      return NextResponse.json({ payload: capturedPayload });
    });
  } catch (error) {
    const classified = classifyAiError(error);
    return NextResponse.json(
      {
        error: classified.message,
        code: classified.code,
        retryable: classified.retryable,
      },
      { status: 500 },
    );
  }
}
