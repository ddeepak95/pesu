/**
 * Backfill the normalized grading tables from the legacy submissions.evaluations JSONB.
 *
 *   npx tsx scripts/backfill-normalized-grading.ts
 *
 * Idempotent: for each submission it deletes any existing submission_questions
 * (cascading to attempts / ai_evaluations / reviews), resets the release flag, then
 * re-derives everything from `evaluations`. The legacy `evaluations` column is left
 * intact (cutover happens in Phase 9).
 *
 * Mapping (see dev-docs/teacher-approval-grading-flow.md §2/§6 Phase 2, §8.1):
 *  - one submission_questions row per question, one submission_attempts row per attempt
 *  - displayable grade (score/feedback/rubric_scores) copied from the legacy attempt
 *  - selected_attempt_id = the LAST non-stale attempt (last-attempt rule everywhere)
 *  - released legacy (no attempt feedback_approved === false) -> feedback_released_at set,
 *    released_score = selected attempt score, one review row per attempted question
 *  - held legacy (some attempt feedback_approved === false) -> flags NULL (still tentative)
 *    + attempt_ai_evaluations rows (held values are pure AI)
 *  - is_evaluating stub -> no AI row, NULL grade columns
 *  - stale carries over
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

// ---- legacy shapes (mirror src/types/submission.ts before cutover) ----
interface LegacyRubricScore {
  item: string;
  points_earned: number;
  points_possible: number;
  feedback: string;
}
interface LegacyAttempt {
  attempt_number: number;
  score: number;
  max_score: number;
  rubric_scores: LegacyRubricScore[];
  evaluation_feedback: string;
  timestamp: string;
  stale?: boolean;
  feedback_approved?: boolean;
  is_evaluating?: boolean;
}
interface LegacyQuestionEvaluations {
  attempts: LegacyAttempt[];
  selected_attempt?: number;
}
interface LegacyAnswer {
  question_order: number;
  answer_text: string;
}

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function getServiceClient(): SupabaseClient {
  const useLocal = process.env.NEXT_PUBLIC_USE_LOCAL_SUPABASE === "true";
  const url = useLocal
    ? process.env.NEXT_PUBLIC_SUPABASE_LOCAL_URL?.trim()
    : process.env.NEXT_PUBLIC_SUPABASE_PROD_URL?.trim();
  const serviceKey = useLocal
    ? process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY?.trim()
    : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new Error("Supabase URL env var is not set");
  if (!serviceKey) throw new Error("Supabase service role key env var is not set");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isNewFormat(
  evaluations: { [key: number]: LegacyQuestionEvaluations } | LegacyAnswer[]
): evaluations is { [key: number]: LegacyQuestionEvaluations } {
  return !Array.isArray(evaluations);
}

function convertToNewFormat(
  oldAnswers: LegacyAnswer[]
): { [key: number]: LegacyQuestionEvaluations } {
  const out: { [key: number]: LegacyQuestionEvaluations } = {};
  for (const answer of oldAnswers) {
    out[answer.question_order] = {
      attempts: [
        {
          attempt_number: 1,
          score: 0,
          max_score: 0,
          rubric_scores: [],
          evaluation_feedback: "",
          timestamp: new Date().toISOString(),
          stale: false,
        },
      ],
      selected_attempt: 1,
    };
  }
  return out;
}

interface Stats {
  submissions: number;
  questions: number;
  attempts: number;
  legacyAttempts: number;
  aiEvals: number;
  reviews: number;
  released: number;
  held: number;
  skippedEmpty: number;
}

async function backfillSubmission(
  supabase: SupabaseClient,
  submission: { submission_id: string; evaluations: unknown; submitted_at: string | null; created_at: string | null },
  stats: Stats
): Promise<void> {
  const sid = submission.submission_id;

  let evaluations = submission.evaluations as
    | { [key: number]: LegacyQuestionEvaluations }
    | LegacyAnswer[]
    | null
    | undefined;

  // Idempotency: wipe prior normalized rows + reset release flag for this submission.
  await supabase.from("submission_questions").delete().eq("submission_id", sid);
  await supabase
    .from("submissions")
    .update({ feedback_released_at: null })
    .eq("submission_id", sid);

  if (evaluations == null) return;
  if (!isNewFormat(evaluations)) evaluations = convertToNewFormat(evaluations);

  const questionEntries = Object.entries(evaluations)
    .map(([k, v]) => ({ order: Number(k), qa: v as LegacyQuestionEvaluations }))
    .filter((e) => Array.isArray(e.qa?.attempts));

  // Count legacy attempts for reconciliation.
  for (const { qa } of questionEntries) stats.legacyAttempts += qa.attempts.length;

  // Classify the whole submission.
  const allAttempts = questionEntries.flatMap((e) => e.qa.attempts);
  const hasAnyAttempt = allAttempts.some((a) => !a.stale);
  if (!hasAnyAttempt) {
    stats.skippedEmpty += 1;
    return; // nothing meaningful to normalize (empty / fully-reset submission)
  }
  const held = allAttempts.some((a) => a.feedback_approved === false);
  const releasedTs =
    submission.submitted_at || submission.created_at || new Date().toISOString();

  for (const { order, qa } of questionEntries) {
    const attempts = qa.attempts;
    if (attempts.length === 0) continue;

    const { data: qRow, error: qErr } = await supabase
      .from("submission_questions")
      .insert({ submission_id: sid, question_order: order })
      .select("id")
      .single();
    if (qErr || !qRow) throw new Error(`question insert failed (${sid}/${order}): ${qErr?.message}`);
    stats.questions += 1;
    const questionId = qRow.id as string;

    // Insert attempts; remember inserted ids by attempt_number.
    const attemptIdByNumber = new Map<number, string>();
    for (const a of attempts) {
      const evaluating = a.is_evaluating === true;
      const { data: aRow, error: aErr } = await supabase
        .from("submission_attempts")
        .insert({
          submission_question_id: questionId,
          attempt_number: a.attempt_number,
          max_score: a.max_score ?? 0,
          stale: a.stale ?? false,
          score: evaluating ? null : a.score,
          feedback: evaluating ? null : a.evaluation_feedback,
          rubric_scores: evaluating ? null : a.rubric_scores ?? null,
        })
        .select("id")
        .single();
      if (aErr || !aRow) throw new Error(`attempt insert failed (${sid}/${order}/${a.attempt_number}): ${aErr?.message}`);
      stats.attempts += 1;
      attemptIdByNumber.set(a.attempt_number, aRow.id as string);

      // Held submissions: persist the original AI result for audit/compare.
      if (held && !evaluating) {
        const { error: aiErr } = await supabase.from("attempt_ai_evaluations").insert({
          attempt_id: aRow.id,
          ai_score: a.score,
          ai_feedback: a.evaluation_feedback,
          ai_rubric_scores: a.rubric_scores ?? null,
          model_meta: null,
        });
        if (aiErr) throw new Error(`ai_eval insert failed (${sid}/${order}/${a.attempt_number}): ${aiErr.message}`);
        stats.aiEvals += 1;
      }
    }

    // Selection = last non-stale attempt (highest attempt_number).
    const nonStale = attempts.filter((a) => !a.stale);
    const selected =
      nonStale.length > 0
        ? nonStale.reduce((m, a) => (a.attempt_number > m.attempt_number ? a : m))
        : null;
    const selectedId = selected ? attemptIdByNumber.get(selected.attempt_number) ?? null : null;

    const questionUpdate: Record<string, unknown> = { selected_attempt_id: selectedId };
    if (!held && selected && selected.is_evaluating !== true) {
      questionUpdate.released_score = selected.score;
    }
    await supabase.from("submission_questions").update(questionUpdate).eq("id", questionId);

    // Released submissions: historical questions are considered reviewed.
    if (!held && nonStale.length > 0) {
      const { error: rErr } = await supabase
        .from("submission_question_reviews")
        .insert({ submission_question_id: questionId });
      if (rErr) throw new Error(`review insert failed (${sid}/${order}): ${rErr.message}`);
      stats.reviews += 1;
    }
  }

  if (held) {
    stats.held += 1;
  } else {
    await supabase
      .from("submissions")
      .update({ feedback_released_at: releasedTs })
      .eq("submission_id", sid);
    stats.released += 1;
  }
  stats.submissions += 1;
}

async function main() {
  loadEnvLocal();
  const supabase = getServiceClient();

  const stats: Stats = {
    submissions: 0,
    questions: 0,
    attempts: 0,
    legacyAttempts: 0,
    aiEvals: 0,
    reviews: 0,
    released: 0,
    held: 0,
    skippedEmpty: 0,
  };

  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("submissions")
      .select("submission_id, evaluations, submitted_at, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      try {
        await backfillSubmission(
          supabase,
          row as {
            submission_id: string;
            evaluations: unknown;
            submitted_at: string | null;
            created_at: string | null;
          },
          stats
        );
      } catch (e) {
        console.error(`Failed on submission ${row.submission_id}:`, e);
        throw e;
      }
    }

    console.log(`...processed ${from + data.length} submissions`);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log("\nBackfill complete:");
  console.table(stats);

  if (stats.attempts !== stats.legacyAttempts) {
    console.warn(
      `NOTE: inserted attempts (${stats.attempts}) != legacy attempts (${stats.legacyAttempts}). ` +
        `This is expected only if some submissions had zero non-stale attempts (skipped: ${stats.skippedEmpty}).`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
