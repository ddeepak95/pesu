"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentItem, ContentItemType } from "@/types/contentItem";
import { Assignment } from "@/types/assignment";
import { Check, Lock, KeyRound } from "lucide-react";
import { UnlockState } from "@/lib/utils/unlockLogic";
import { supportedLanguages } from "@/utils/supportedLanguages";
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
import { Pill } from "@/components/ui/pill";

export default function ContentCard({
  item,
  title,
  titleLoading,
  assessmentMode,
  preferredLanguageCode,
  isComplete,
  unlockState,
  onOpen,
}: {
  item: ContentItem;
  title?: string;
  titleLoading?: boolean;
  assessmentMode?: Assignment["assessment_mode"];
  /** Language code (e.g. from assignment preferred_language) for display. */
  preferredLanguageCode?: string;
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
        return "Content";
      case "formative_assignment":
        return "Activity";
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
              <Pill purpose="contentType">{labelForType(item.type)}</Pill>
              {item.type === "formative_assignment" && assessmentMode && (
                <Pill purpose="assessmentMode">
                  {labelForAssessmentMode(assessmentMode)}
                </Pill>
              )}
              {preferredLanguageCode && (
                <Pill purpose="language">
                  {supportedLanguages.find((l) => l.code === preferredLanguageCode)?.name ?? preferredLanguageCode}
                </Pill>
              )}
              {item.status === "draft" && (
                <Pill purpose="draft">Draft</Pill>
              )}
              {isComplete && (
                <Pill purpose="contentCompleted">
                  <Check className="w-3 h-3" />
                  Completed
                </Pill>
              )}
              {isLocked && unlockState?.isTeacherLocked && (
                <Pill purpose="teacherUnlockRequired">
                  <KeyRound className="w-3 h-3" />
                  Awaiting Unlock
                </Pill>
              )}
              {isLocked && !unlockState?.isTeacherLocked && (
                <Pill purpose="contentLocked">
                  <Lock className="w-3 h-3" />
                  Locked
                </Pill>
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
