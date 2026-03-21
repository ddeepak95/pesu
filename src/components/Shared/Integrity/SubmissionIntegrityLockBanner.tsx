"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearSubmissionIntegrityRevocation } from "@/lib/queries/submissions";
import { getIntegrityRevokedLabel } from "@/lib/integrity/reasonLabels";

interface SubmissionIntegrityLockBannerProps {
  submissionId: string;
  revokedAt: string | null | undefined;
  reasonCode: string | null | undefined;
  onRestored: () => void | Promise<void>;
}

export function SubmissionIntegrityLockBanner({
  submissionId,
  revokedAt,
  reasonCode,
  onRestored,
}: SubmissionIntegrityLockBannerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!revokedAt) return null;

  const handleRestore = async () => {
    setError(null);
    setLoading(true);
    try {
      await clearSubmissionIntegrityRevocation(submissionId);
      await onRestored();
    } catch (e) {
      console.error(e);
      setError("Could not restore access. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Student access suspended
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {getIntegrityRevokedLabel(reasonCode)} —{" "}
          {new Date(revokedAt).toLocaleString()}
        </p>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={handleRestore}
      >
        {loading ? "Restoring…" : "Restore student access"}
      </Button>
    </div>
  );
}
