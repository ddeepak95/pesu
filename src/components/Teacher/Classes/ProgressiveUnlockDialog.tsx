"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateClass } from "@/lib/queries/classes";
import { Class } from "@/types/class";
import { Info } from "lucide-react";

interface ProgressiveUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classData: Class;
  onSuccess: () => void;
}

export default function ProgressiveUnlockDialog({
  open,
  onOpenChange,
  classData,
  onSuccess,
}: ProgressiveUnlockDialogProps) {
  const [enableProgressiveUnlock, setEnableProgressiveUnlock] = useState(
    classData.enable_progressive_unlock ?? false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await updateClass(classData.id, {
        enable_progressive_unlock: enableProgressiveUnlock,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error("Error updating progressive unlock setting:", err);
      setError("Failed to update settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Progressive Unlock Settings</DialogTitle>
          <DialogDescription>
            Configure how students access content in this class
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="enable-progressive-unlock" className="text-base">
                Enable Progressive Unlock
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, students can only access content items
                sequentially. They must mark each item as complete before the
                next one unlocks.
              </p>
            </div>
            <Switch
              id="enable-progressive-unlock"
              checked={enableProgressiveUnlock}
              onCheckedChange={setEnableProgressiveUnlock}
            />
          </div>

          <div className="rounded-lg border bg-muted/50 p-4 flex gap-3">
            <Info className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">How it works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>The first content item is unlocked by default</li>
                <li>
                  Students must mark an item complete to unlock the next one
                </li>
                <li>
                  Items are unlocked in the order they appear in the content
                  list
                </li>
                <li>
                  You can also mark specific items to lock permanently after
                  completion
                </li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
