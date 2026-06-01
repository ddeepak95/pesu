"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { StickyFooter } from "@/components/ui/sticky-footer";

interface AssignmentFormFooterProps {
  mode: "create" | "edit";
  /** Whether the assignment being edited is currently a draft (drives the primary label). */
  initialIsDraft?: boolean;
  loading: boolean;
  /** Validation/submit error, shown above the buttons so it stays visible. */
  error?: string | null;
  /** Cancel/close action; the button is hidden when not provided. */
  onCancel?: () => void;
  /** Save-as-draft action. Wire to `(e) => handleSubmit(e, true)` in the parent. */
  onSaveDraft: (e: React.MouseEvent) => void;
}

/** Label for the primary submit button, given mode/draft/loading state. */
function primaryLabel(
  mode: "create" | "edit",
  initialIsDraft: boolean,
  loading: boolean,
): string {
  if (loading) {
    if (mode === "edit") return initialIsDraft ? "Publishing..." : "Updating...";
    return "Creating...";
  }
  if (mode === "edit") return initialIsDraft ? "Publish" : "Update Assignment";
  return "Create Assignment";
}

/**
 * Sticky action bar for the assignment create/edit form: Cancel · Save as Draft ·
 * Create/Update. Renders inside the parent `<form>` so the primary button can stay
 * `type="submit"` (native submit fires the form's handler with `draft=false`).
 */
export function AssignmentFormFooter({
  mode,
  initialIsDraft = false,
  loading,
  error,
  onCancel,
  onSaveDraft,
}: AssignmentFormFooterProps) {
  return (
    <StickyFooter>
      {error && (
        <p className="mb-2 text-center text-sm text-destructive">{error}</p>
      )}
      <div className="flex justify-center gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={onSaveDraft}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save as Draft"}
        </Button>
        <Button type="submit" disabled={loading}>
          {primaryLabel(mode, initialIsDraft, loading)}
        </Button>
      </div>
    </StickyFooter>
  );
}
