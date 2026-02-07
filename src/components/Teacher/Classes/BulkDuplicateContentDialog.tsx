"use client";

import { useState } from "react";
import { ContentItem } from "@/types/contentItem";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exclude the source group from the destination options
  const availableGroups = groups.filter((g) => g.id !== sourceGroupId);

  const canSubmit =
    items.length > 0 && !!user && !!destinationGroupId && !loading;

  const handleDuplicate = async () => {
    if (!user || items.length === 0 || !destinationGroupId) return;
    setLoading(true);
    setError(null);
    try {
      await duplicateContentItems({
        items,
        destinationClassDbId: classDbId,
        destinationClassGroupId: destinationGroupId,
        userId: user.id,
      });
      onOpenChange(false);
      setDestinationGroupId("");
      onDuplicated?.();
    } catch (err: unknown) {
      console.error("Error duplicating content items:", err);
      const message =
        typeof err === "object" && err !== null
          ? ((err as Record<string, unknown>)["message"] as string | undefined)
          : undefined;
      setError(message || "Failed to duplicate content items.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDestinationGroupId("");
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
            Create copies of the selected items in another group within this
            class. Items will be added in their current order.
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
