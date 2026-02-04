"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentItem, ContentItemType } from "@/types/contentItem";
import { Assignment } from "@/types/assignment";
import { Check, Lock } from "lucide-react";
import { UnlockState } from "@/lib/utils/unlockLogic";
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

export default function ContentCard({
  item,
  title,
  titleLoading,
  assessmentMode,
  isComplete,
  unlockState,
  onOpen,
}: {
  item: ContentItem;
  title?: string;
  titleLoading?: boolean;
  assessmentMode?: Assignment["assessment_mode"];
  isComplete?: boolean;
  unlockState?: UnlockState;
  onOpen: () => void;
}) {
  const [showLockDialog, setShowLockDialog] = useState(false);
  const [lockMessage, setLockMessage] = useState("");
  const labelForType = (type: ContentItemType) => {
    switch (type) {
      case "quiz":
        return "Quiz";
      case "learning_content":
        return "Learning Content";
      case "formative_assignment":
        return "Learning Activity";
      case "survey":
        return "Survey";
      default:
        return "Content";
    }
  };

  const labelForAssessmentMode = (
    mode: Assignment["assessment_mode"]
  ): string => {
    switch (mode) {
      case "voice":
        return "Voice";
      case "text_chat":
        return "Text Chat";
      case "static_text":
        return "Static Text";
      default:
        return "Voice";
    }
  };

  const isLocked = unlockState?.isLocked ?? false;

  const handleClick = () => {
    if (isLocked && unlockState?.lockReason) {
      setLockMessage(unlockState.lockReason);
      setShowLockDialog(true);
    } else {
      onOpen();
    }
  };

  return (
    <>
      <Card
        className={`transition-colors ${
          isLocked
            ? "opacity-60 cursor-not-allowed"
            : "cursor-pointer hover:bg-accent"
        }`}
        onClick={handleClick}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Labels row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
                {labelForType(item.type)}
              </span>
              {item.type === "formative_assignment" && assessmentMode && (
                <span className="text-xs rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary">
                  {labelForAssessmentMode(assessmentMode)}
                </span>
              )}
              {item.status === "draft" && (
                <span className="text-xs rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
                  Draft
                </span>
              )}
              {isComplete && (
                <span className="text-xs rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Completed
                </span>
              )}
              {isLocked && (
                <span className="text-xs rounded-full border border-gray-500/30 bg-gray-500/10 px-2 py-0.5 text-gray-600 dark:text-gray-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Locked
                </span>
              )}
            </div>

            {/* Title row */}
            {titleLoading ? (
              <div className="h-6 w-48 rounded bg-muted animate-pulse" />
            ) : (
              <CardTitle className="text-lg truncate">
                {title || "Untitled"}
              </CardTitle>
            )}
          </div>
        </CardHeader>
      </Card>

      <Dialog open={showLockDialog} onOpenChange={setShowLockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Content Locked</DialogTitle>
            <DialogDescription>{lockMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowLockDialog(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
