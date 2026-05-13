"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { moveClassRequestAction } from "@/app/platform/actions";

interface MoveClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classDbId: string;
  className: string;
  /** UUID of the institution the class currently lives in. Excluded from the target options. */
  currentInstitutionId: string;
  /** `[institutionId, name]` entries for the target dropdown. */
  institutions: Array<[string, string]>;
  /** UUID of the seeded default institution, if known. Used to mark it in the dropdown. */
  defaultInstitutionId?: string | null;
  onMoved?: () => void;
}

/**
 * Dialog for moving a single class to another institution. Wraps the audited
 * `move_class_to_institution` RPC via `moveClassRequestAction`. Only rendered
 * for super admins (gated by the caller).
 */
export default function MoveClassDialog({
  open,
  onOpenChange,
  classDbId,
  className,
  currentInstitutionId,
  institutions,
  defaultInstitutionId,
  onMoved,
}: MoveClassDialogProps) {
  const router = useTrackedRouter();
  const [targetId, setTargetId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const targetOptions = useMemo(
    () => institutions.filter(([id]) => id !== currentInstitutionId),
    [institutions, currentInstitutionId],
  );

  const reset = () => {
    setTargetId("");
    setReason("");
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = () => {
    if (!targetId) {
      setError("Pick a target institution");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await moveClassRequestAction({
        classDbId,
        targetInstitutionId: targetId,
        reason: reason.trim() || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to move class");
        return;
      }
      onMoved?.();
      handleOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move &ldquo;{className}&rdquo;</DialogTitle>
          <DialogDescription>
            Move this class to another institution. The change is audited and
            takes effect immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targetInstitution">
              Target institution <span className="text-destructive">*</span>
            </Label>
            <Select
              value={targetId}
              onValueChange={setTargetId}
              disabled={isPending}
            >
              <SelectTrigger id="targetInstitution">
                <SelectValue placeholder="Select an institution" />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No other institutions available.
                  </div>
                ) : (
                  targetOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                      {defaultInstitutionId && id === defaultInstitutionId
                        ? " (default)"
                        : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="moveReason">Reason (optional)</Label>
            <Textarea
              id="moveReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. onboarding to Acme"
              rows={3}
              disabled={isPending}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !targetId || targetOptions.length === 0}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? "Moving…" : "Move class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
