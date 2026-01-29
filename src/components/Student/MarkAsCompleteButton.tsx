"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "lucide-react";
import { markContentAsComplete } from "@/lib/queries/contentCompletions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

interface MarkAsCompleteButtonProps {
  contentItemId: string;
  isComplete: boolean;
  onComplete?: () => void;
  className?: string;
}

export default function MarkAsCompleteButton({
  contentItemId,
  isComplete: initialIsComplete,
  onComplete,
  className,
}: MarkAsCompleteButtonProps) {
  const [isComplete, setIsComplete] = useState(initialIsComplete);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleMarkComplete = async () => {
    setIsLoading(true);
    try {
      await markContentAsComplete(contentItemId);
      setIsComplete(true);
      setIsDialogOpen(false);
      showSuccessToast("Marked as complete!");
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error("Error marking content as complete:", error);
      showErrorToast("Failed to mark as complete. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isComplete) {
    return (
      <Button
        variant="outline"
        disabled
        className={`${className} text-green-600 border-green-600/50 bg-green-50 hover:bg-green-50`}
      >
        <Check className="w-4 h-4 mr-2" />
        Completed
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsDialogOpen(true)}
        className={className}
      >
        Mark as Complete
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Complete</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this content as complete?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleMarkComplete} disabled={isLoading}>
              {isLoading ? "Saving..." : "Yes, Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
