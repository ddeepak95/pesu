import "server-only";

import { createServiceRoleClient } from "@/lib/supabase-server";
import type { AiErrorCode } from "@/lib/ai/errors";

/**
 * Fire-and-forget admin event logger. Writes one row to public.app_logs via the
 * service-role client (RLS-readable by super admins / institution admins). It
 * resolves institution_id from classId at write time (denormalized so RLS needs
 * no join), and NEVER throws or blocks the caller — logging must never slow or
 * break a user-facing flow. See dev-docs/ai-retry-and-failure-recovery-plan.md §8.
 */

export interface LogAppEventInput {
  level: "info" | "warn" | "error";
  source: string;
  event: string;
  errorCode?: AiErrorCode;
  message?: string;
  classId?: string | null;
  activityType?: string | null;
  activityId?: string | null;
  submissionId?: string | null;
  questionOrder?: number | null;
  questionId?: string | null;
  userId?: string | null;
  aiInvocationId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function resolveInstitutionId(
  service: ReturnType<typeof createServiceRoleClient>,
  classId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("classes")
    .select("institution_id")
    .eq("id", classId)
    .maybeSingle();
  if (error) return null;
  return (data?.institution_id as string | undefined) ?? null;
}

export function logAppEvent(input: LogAppEventInput): void {
  // Detach from the caller's promise chain entirely — even the institution
  // lookup must not block or reject into the caller.
  void (async () => {
    try {
      const service = createServiceRoleClient();
      const institutionId = input.classId
        ? await resolveInstitutionId(service, input.classId)
        : null;

      const { error } = await service.from("app_logs").insert({
        level: input.level,
        source: input.source,
        event: input.event,
        error_code: input.errorCode ?? null,
        message: input.message ?? null,
        institution_id: institutionId,
        class_id: input.classId ?? null,
        activity_type: input.activityType ?? null,
        activity_id: input.activityId ?? null,
        submission_id: input.submissionId ?? null,
        question_order: input.questionOrder ?? null,
        question_id: input.questionId ?? null,
        user_id: input.userId ?? null,
        ai_invocation_id: input.aiInvocationId ?? null,
        metadata: input.metadata ?? {},
      });
      if (error) {
        console.error("[app-logs] insert failed:", error);
      }
    } catch (err) {
      // Swallow — a logging outage must never mask or amplify the original error.
      console.error("[app-logs] logAppEvent failed:", err);
    }
  })();
}
