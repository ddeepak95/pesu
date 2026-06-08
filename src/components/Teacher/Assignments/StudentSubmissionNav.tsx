"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface SubmissionNavItem {
  submissionId: string;
  label: string;
}

interface StudentSubmissionNavProps {
  submissionId: string;
  navigationItems: SubmissionNavItem[];
  onNavigate: (submissionId: string) => void;
  onClose: () => void;
}

export function StudentSubmissionNav({
  submissionId,
  navigationItems,
  onNavigate,
  onClose,
}: StudentSubmissionNavProps) {
  const currentIndex = useMemo(
    () => navigationItems.findIndex((item) => item.submissionId === submissionId),
    [navigationItems, submissionId]
  );

  const selectOptions = useMemo(
    () => navigationItems.map((item) => ({ value: item.submissionId, label: item.label })),
    [navigationItems]
  );

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => currentIndex > 0 && onNavigate(navigationItems[currentIndex - 1].submissionId)}
        disabled={currentIndex <= 0}
        aria-label="Previous student"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 min-w-0">
        <SearchableSelect
          value={submissionId}
          onValueChange={(id) => id && id !== submissionId && onNavigate(id)}
          options={selectOptions}
          placeholder="Select student..."
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() =>
          currentIndex < navigationItems.length - 1 &&
          onNavigate(navigationItems[currentIndex + 1].submissionId)
        }
        disabled={currentIndex >= navigationItems.length - 1}
        aria-label="Next student"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Close submission view"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
