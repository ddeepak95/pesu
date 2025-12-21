"use client";

import { useEffect, useState } from "react";
import { Class } from "@/types/class";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconfigureClassGroups } from "@/lib/queries/groups";
import { useAuth } from "@/contexts/AuthContext";

export default function GroupSettingsDialog({
  classData,
  open,
  onOpenChange,
  onUpdated,
}: {
  classData: Class;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const { user } = useAuth();
  const isOwner = user?.id === classData.created_by;

  const [groupCount, setGroupCount] = useState<number>(
    classData.group_count ?? 1
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGroupCount(classData.group_count ?? 1);
      setError(null);
    }
  }, [open, classData.group_count]);

  const handleSave = async () => {
    if (!isOwner) return;
    if (!Number.isFinite(groupCount) || groupCount < 1) {
      setError("Group count must be at least 1.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await reconfigureClassGroups({
        classDbId: classData.id,
        newGroupCount: groupCount,
      });
      onOpenChange(false);
      onUpdated?.();
    } catch (err: unknown) {
      console.error("Error updating group count:", err);
      setError(
        "Failed to update group count. Make sure the groups migration is applied."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>
            Set how many groups this class has. When decreasing, students in
            removed groups are reassigned.
          </DialogDescription>
        </DialogHeader>

        {!isOwner && (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            Only the class owner can change group settings.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="groupCount">Number of groups</Label>
          <Input
            id="groupCount"
            type="number"
            min={1}
            value={groupCount}
            disabled={!isOwner || loading}
            onChange={(e) => setGroupCount(Number(e.target.value))}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isOwner || loading}
          >
            {loading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
