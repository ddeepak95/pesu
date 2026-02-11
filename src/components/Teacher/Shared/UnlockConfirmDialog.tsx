"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Unlock } from "lucide-react";
import { useState } from "react";

interface UnlockConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  contentName: string;
  /** true = currently unlocked (action will lock), false = currently locked (action will unlock) */
  isCurrentlyUnlocked: boolean;
  onConfirm: () => Promise<void>;
}

export default function UnlockConfirmDialog({
  open,
  onOpenChange,
  studentName,
  contentName,
  isCurrentlyUnlocked,
  onConfirm,
}: UnlockConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const action = isCurrentlyUnlocked ? "lock" : "unlock";
  const ActionIcon = isCurrentlyUnlocked ? Lock : Unlock;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error(`Error ${action}ing content:`, err);
      alert(`Failed to ${action} content. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ActionIcon className="h-5 w-5" />
            {isCurrentlyUnlocked ? "Lock Content" : "Unlock Content"}
          </DialogTitle>
          <DialogDescription>
            {isCurrentlyUnlocked
              ? `Are you sure you want to lock "${contentName}" for ${studentName}? They will no longer be able to access this content.`
              : `Are you sure you want to unlock "${contentName}" for ${studentName}? They will be able to access this content.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant={isCurrentlyUnlocked ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading
              ? isCurrentlyUnlocked
                ? "Locking..."
                : "Unlocking..."
              : isCurrentlyUnlocked
                ? "Lock"
                : "Unlock"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
