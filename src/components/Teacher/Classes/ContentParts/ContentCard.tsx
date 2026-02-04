"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Share2,
  Lock,
} from "lucide-react";
import { ContentItem, ContentItemType } from "@/types/contentItem";
import { Assignment } from "@/types/assignment";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function ContentCard({
  item,
  index,
  total,
  title,
  titleLoading,
  savingOrder,
  assessmentMode,
  onOpen,
  onMove,
  onEdit,
  onDuplicate,
  onDelete,
  onShareLinks,
  onToggleLockAfterComplete,
}: {
  item: ContentItem;
  index: number;
  total: number;
  title?: string;
  titleLoading?: boolean;
  savingOrder: boolean;
  assessmentMode?: Assignment["assessment_mode"];
  onOpen: () => void;
  onMove: (direction: "up" | "down") => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShareLinks?: () => void;
  onToggleLockAfterComplete?: (
    itemId: string,
    lockAfterComplete: boolean
  ) => void;
}) {
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

  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={onOpen}
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
            {item.lock_after_complete && (
              <span className="text-xs rounded-full border border-gray-500/30 bg-gray-500/10 px-2 py-0.5 text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Locks After Complete
              </span>
            )}
          </div>

          {/* Title row */}
          {titleLoading ? (
            <div className="h-6 w-48 rounded bg-muted animate-pulse" />
          ) : (
            <CardTitle className="text-lg truncate">{title}</CardTitle>
          )}
        </div>

        <div
          className="flex items-center shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Actions"
                title="Actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              {onShareLinks && item.type === "formative_assignment" && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onShareLinks();
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share Links
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate to…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onToggleLockAfterComplete && (
                <>
                  <div
                    className="flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLockAfterComplete(
                        item.id,
                        !(item.lock_after_complete ?? false)
                      );
                    }}
                  >
                    <Label
                      htmlFor={`lock-${item.id}`}
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Lock className="h-4 w-4" />
                      Lock after complete
                    </Label>
                    <Switch
                      id={`lock-${item.id}`}
                      checked={item.lock_after_complete ?? false}
                      onCheckedChange={(checked) => {
                        onToggleLockAfterComplete(item.id, checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                disabled={savingOrder || index === 0}
                onClick={() => onMove("up")}
              >
                <ChevronUp className="h-4 w-4 mr-2" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={savingOrder || index === total - 1}
                onClick={() => onMove("down")}
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
    </Card>
  );
}
