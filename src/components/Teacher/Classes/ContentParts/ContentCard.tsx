"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronUp, MoreVertical } from "lucide-react";
import { ContentItem, ContentItemType } from "@/types/contentItem";

export default function ContentCard({
  item,
  index,
  total,
  title,
  titleLoading,
  savingOrder,
  onOpen,
  onMove,
  onDuplicate,
}: {
  item: ContentItem;
  index: number;
  total: number;
  title?: string;
  titleLoading?: boolean;
  savingOrder: boolean;
  onOpen: () => void;
  onMove: (direction: "up" | "down") => void;
  onDuplicate: () => void;
}) {
  const labelForType = (type: ContentItemType) => {
    switch (type) {
      case "quiz":
        return "Quiz";
      case "learning_content":
        return "Learning Content";
      case "formative_assignment":
        return "Formative Assessment";
      default:
        return "Content";
    }
  };

  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={onOpen}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
              {labelForType(item.type)}
            </span>
            {item.status === "draft" && (
              <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
                Draft
              </span>
            )}
            {titleLoading ? (
              <div className="h-5 w-48 rounded bg-muted animate-pulse" />
            ) : (
              <CardTitle className="text-lg truncate">{title}</CardTitle>
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-2"
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
              <DropdownMenuItem onClick={onDuplicate}>
                Duplicate to…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            disabled={savingOrder || index === 0}
            onClick={() => onMove("up")}
            aria-label="Move up"
            title="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={savingOrder || index === total - 1}
            onClick={() => onMove("down")}
            aria-label="Move down"
            title="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
