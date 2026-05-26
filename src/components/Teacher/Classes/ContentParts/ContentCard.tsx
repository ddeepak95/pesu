"use client";

import { useState, useEffect, type MouseEvent } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  KeyRound,
  CalendarClock,
  Settings,
} from "lucide-react";
import { LinkedMaterialPillWithInfoTooltip } from "@/components/Shared/LinkedMaterialPill";
import { ContentItem, ContentItemType } from "@/types/contentItem";
import { Assignment } from "@/types/assignment";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Pill } from "@/components/ui/pill";
import { supportedLanguages } from "@/utils/supportedLanguages";

export default function ContentCard({
  item,
  index,
  total,
  title,
  href,
  titleLoading,
  savingOrder,
  assessmentMode,
  selectionMode,
  selected,
  onToggleSelect,
  onOpen,
  onMove,
  onEdit,
  onDuplicate,
  onDelete,
  onShareLinks,
  onToggleLockAfterComplete,
  onToggleRequireTeacherUnlock,
  onUpdateUnlockDaysAfterPrevious,
  language,
  isLinked,
}: {
  item: ContentItem;
  index: number;
  total: number;
  title?: string;
  href?: string;
  titleLoading?: boolean;
  savingOrder: boolean;
  assessmentMode?: Assignment["assessment_mode"];
  language?: string;
  /** Same underlying material appears in more than one group feed. */
  isLinked?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  onMove: (direction: "up" | "down") => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onShareLinks?: () => void;
  onToggleLockAfterComplete?: (
    itemId: string,
    lockAfterComplete: boolean,
  ) => void;
  onToggleRequireTeacherUnlock?: (
    itemId: string,
    requireTeacherUnlock: boolean,
  ) => void;
  onUpdateUnlockDaysAfterPrevious?: (
    itemId: string,
    days: number | null,
  ) => void;
}) {
  const [localDays, setLocalDays] = useState<string>(() =>
    String(item.unlock_days_after_previous ?? 0),
  );

  useEffect(() => {
    queueMicrotask(() =>
      setLocalDays(String(item.unlock_days_after_previous ?? 0)),
    );
  }, [item.unlock_days_after_previous]);

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
    mode: Assignment["assessment_mode"],
  ): string => {
    switch (mode) {
      case "voice":
        return "Voice";
      case "text_chat":
        return "Text Chat";
      case "static_text":
        return "Static Text";
      case "multimodal":
        return "Multimodal";
      default:
        return "Voice";
    }
  };

  const handleSelectionClick = () => {
    if (selectionMode) {
      onToggleSelect?.();
    }
  };

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const isPlainLeftClick =
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;

    if (!isPlainLeftClick) return;

    event.preventDefault();
    onOpen();
  };

  return (
    <Card
      className={`relative hover:bg-accent transition-colors ${
        href || selectionMode ? "cursor-pointer" : ""
      } ${
        selectionMode && selected ? "ring-2 ring-primary" : ""
      }`}
      onClick={selectionMode ? handleSelectionClick : undefined}
    >
      {!selectionMode && href && (
        <a
          href={href}
          onClick={handleLinkClick}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Open ${title ?? labelForType(item.type)}`}
        />
      )}
      <CardHeader className="relative z-10 flex flex-row items-start justify-between gap-4 space-y-0 pointer-events-none">
        {selectionMode && (
          <div
            className="flex items-center pt-1 shrink-0 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={selected ?? false}
              onCheckedChange={() => onToggleSelect?.()}
            />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Labels row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Pill purpose="contentType">{labelForType(item.type)}</Pill>
            {item.type === "formative_assignment" && assessmentMode && (
              <Pill purpose="assessmentMode">
                {labelForAssessmentMode(assessmentMode)}
              </Pill>
            )}
            {item.status === "draft" && (
              <Pill purpose="draft">Draft</Pill>
            )}
            {isLinked && (
              <span className="pointer-events-auto">
                <LinkedMaterialPillWithInfoTooltip />
              </span>
            )}
            {language && (
              <Pill purpose="language">
                {supportedLanguages.find((l) => l.code === language)?.name ||
                  language}
              </Pill>
            )}
            {item.lock_after_complete && (
              <Pill purpose="lockAfterComplete">
                <Lock className="w-3 h-3" />
                Locks After Complete
              </Pill>
            )}
            {item.require_teacher_unlock && (
              <Pill purpose="teacherUnlockRequired">
                <KeyRound className="w-3 h-3" />
                Teacher Unlock
              </Pill>
            )}
            {(item.unlock_days_after_previous ?? 0) > 0 && (
              <Pill purpose="scheduledUnlock">
                <CalendarClock className="w-3 h-3" />
                Unlocks {item.unlock_days_after_previous} days after previous
              </Pill>
            )}
          </div>

          {/* Title row */}
          {titleLoading ? (
            <div className="h-6 w-48 rounded bg-muted animate-pulse" />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-lg truncate min-w-0">
                {title}
              </CardTitle>
            </div>
          )}
        </div>

        <div
          className="flex items-center shrink-0 pointer-events-auto"
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
              {(onToggleLockAfterComplete ||
                onToggleRequireTeacherUnlock ||
                onUpdateUnlockDaysAfterPrevious) && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Settings className="h-4 w-4 mr-2" />
                    Options
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {onToggleLockAfterComplete && (
                      <div
                        className="flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLockAfterComplete(
                            item.id,
                            !(item.lock_after_complete ?? false),
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
                    )}
                    {onToggleRequireTeacherUnlock && (
                      <div
                        className="flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleRequireTeacherUnlock(
                            item.id,
                            !(item.require_teacher_unlock ?? false),
                          );
                        }}
                      >
                        <Label
                          htmlFor={`teacher-unlock-${item.id}`}
                          className="cursor-pointer flex items-center gap-2"
                        >
                          <KeyRound className="h-4 w-4" />
                          Require teacher unlock
                        </Label>
                        <Switch
                          id={`teacher-unlock-${item.id}`}
                          checked={item.require_teacher_unlock ?? false}
                          onCheckedChange={(checked) => {
                            onToggleRequireTeacherUnlock(item.id, checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                    {onUpdateUnlockDaysAfterPrevious && index > 0 && (
                      <div
                        className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Label
                          htmlFor={`unlock-days-${item.id}`}
                          className="flex items-center gap-2 shrink-0"
                        >
                          <CalendarClock className="h-4 w-4" />
                          Unlock days after previous
                        </Label>
                        <Input
                          id={`unlock-days-${item.id}`}
                          type="number"
                          min={0}
                          max={365}
                          value={localDays}
                          onChange={(e) => setLocalDays(e.target.value)}
                          onBlur={() => {
                            const num =
                              localDays === ""
                                ? 0
                                : Math.min(
                                    365,
                                    Math.max(0, parseInt(localDays, 10) || 0),
                                  );
                            setLocalDays(String(num));
                            onUpdateUnlockDaysAfterPrevious(
                              item.id,
                              num === 0 ? null : num,
                            );
                          }}
                          className="h-8 w-16"
                        />
                      </div>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {(onToggleLockAfterComplete ||
                onToggleRequireTeacherUnlock ||
                onUpdateUnlockDaysAfterPrevious) && <DropdownMenuSeparator />}
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
