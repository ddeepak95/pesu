"use client";

import { useState } from "react";
import { ContentItem } from "@/types/contentItem";
import {
  type ContentDuplicateMode,
  contentDuplicateFailureMessage,
} from "@/lib/contentPlacements";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassGroup } from "@/lib/queries/groups";
import { duplicateContentItems } from "@/lib/queries/duplicateContent";
import { invalidateContentItemsByGroup } from "@/hooks/swr";
import { DuplicateContentModeSelect } from "@/components/Teacher/Classes/DuplicateContentModeSelect";
import { showErrorToast } from "@/lib/toast";

export default function BulkDuplicateContentDialog({
  open,
  onOpenChange,
  items,
  classDbId,
  groups,
  sourceGroupId,
  onDuplicated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ContentItem[];
  classDbId: string;
  groups: ClassGroup[];
  sourceGroupId: string | null;
  onDuplicated?: () => void;
}) {
  const { user } = useAuth();

  const [destinationGroupId, setDestinationGroupId] = useState<string>("");
  const [duplicateMode, setDuplicateMode] = useState<ContentDuplicateMode>("copy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exclude the source group from the destination options
  const availableGroups = groups.filter((g) => g.id !== sourceGroupId);

  const canSubmit =
    items.length > 0 && !!user && !!destinationGroupId && !loading;

  const handleDuplicate = async () => {
    if (!user || items.length === 0 || !destinationGroupId) return;
    if (
      duplicateMode === "linked" &&
      items.some(
        (i) => i.class_group_id != null && i.class_group_id === destinationGroupId
      )
    ) {
      const msg =
        "One or more selected items are already linked in the destination group.";
      setError(msg);
      showErrorToast(msg);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await duplicateContentItems({
        items,
        destinationClassDbId: classDbId,
        destinationClassGroupId: destinationGroupId,
        userId: user.id,
        mode: duplicateMode,
      });
      await invalidateContentItemsByGroup(classDbId, destinationGroupId);
      const sourceIds = new Set(
        items.map((i) => i.class_group_id).filter((id): id is string => !!id)
      );
      for (const gid of sourceIds) {
        if (gid !== destinationGroupId) {
          await invalidateContentItemsByGroup(classDbId, gid);
        }
      }
      onOpenChange(false);
      setDestinationGroupId("");
      setDuplicateMode("copy");
      onDuplicated?.();
    } catch (err: unknown) {
      console.error("Error duplicating content items:", err);
      const message = contentDuplicateFailureMessage(
        err,
        "Failed to duplicate content items."
      );
      setError(message);
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDestinationGroupId("");
      setDuplicateMode("copy");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate {items.length} item{items.length !== 1 ? "s" : ""} to...</DialogTitle>
          <DialogDescription>
            Add the selected items to another group in this class, in their
            current order, as independent copies or linked placements.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Destination group</Label>
            {availableGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other groups available. Add more groups to the class first.
              </p>
            ) : (
              <Select
                value={destinationGroupId}
                onValueChange={setDestinationGroupId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name || `Group ${g.group_index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {availableGroups.length > 0 && (
            <DuplicateContentModeSelect
              value={duplicateMode}
              onChange={setDuplicateMode}
            />
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDuplicate}
            disabled={!canSubmit}
          >
            {loading
              ? "Duplicating..."
              : `Duplicate ${items.length} item${items.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
