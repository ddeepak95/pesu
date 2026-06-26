"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, EyeOff, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  invalidateSubmissionsCache,
  useClassData,
  usePublicSubmissionsForAssignment,
  useSubmissionsForAssignment,
} from "@/hooks/swr";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

interface AssignmentGradeReleaseBannerProps {
  assignmentId: string;
  classId: string;
  classGroupId?: string | null;
  isPublic?: boolean;
  gradesReleasedAt: string | null;
  /** Called with the new grades_released_at after a successful toggle. */
  onChange: (next: string | null) => void;
}

/**
 * Batch-mode control: holds all finalized grades hidden until the teacher opens the
 * assignment-level gate, then reveals every finalized submission at once. Only
 * rendered for assignments with batch_grade_release enabled.
 */
export function AssignmentGradeReleaseBanner({
  assignmentId,
  classId,
  classGroupId = null,
  isPublic = false,
  gradesReleasedAt,
  onChange,
}: AssignmentGradeReleaseBannerProps) {
  const [busy, setBusy] = useState(false);

  const classQuery = useClassData(classId);
  const classDbId = classQuery.data?.id ?? null;
  const classSubmissions = useSubmissionsForAssignment({
    assignmentId,
    classId: classDbId,
    classGroupId,
  });
  const publicSubmissions = usePublicSubmissionsForAssignment(
    isPublic ? assignmentId : null,
  );

  const finalizedCount = useMemo(() => {
    const fromClass = (classSubmissions.data ?? []).filter(
      (s) => s.submission && s.released,
    ).length;
    const fromPublic = (publicSubmissions.data ?? []).filter(
      (s) => s.released,
    ).length;
    return fromClass + fromPublic;
  }, [classSubmissions.data, publicSubmissions.data]);

  const released = gradesReleasedAt != null;

  const setRelease = async (release: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/assignments/release-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, release }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      const data = await res.json();
      onChange(data.grades_released_at ?? null);
      await invalidateSubmissionsCache();
      showSuccessToast(
        release
          ? "Grades released — finalized submissions are now visible to students."
          : "Grades hidden from students again.",
      );
    } catch (err) {
      showErrorToast(
        err instanceof Error ? err.message : "Failed to update grade release",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-4 py-3">
      <div className="flex items-start gap-2 text-sm">
        {released ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
        ) : (
          <Lock className="mt-0.5 h-4 w-4 text-amber-600" />
        )}
        <div>
          <p className="font-medium">
            {released ? "Grades released to students" : "Grades held"}
          </p>
          <p className="text-xs text-muted-foreground">
            {released
              ? `Released ${new Date(gradesReleasedAt).toLocaleString()}. Finalized submissions are visible; un-graded ones stay hidden.`
              : `${finalizedCount} finalized submission${finalizedCount === 1 ? "" : "s"} will become visible. Un-graded submissions stay hidden.`}
          </p>
        </div>
      </div>
      {released ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => setRelease(false)}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <EyeOff className="mr-2 h-4 w-4" />
          )}
          Hide grades again
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={busy || finalizedCount === 0}
          onClick={() => setRelease(true)}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Release Assignment Grades
        </Button>
      )}
    </div>
  );
}
