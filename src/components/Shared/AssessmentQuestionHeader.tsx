"use client";

import {
  SearchableSelect,
} from "@/components/ui/searchable-select";
import { supportedLanguages } from "@/utils/supportedLanguages";

interface AssessmentQuestionHeaderProps {
  questionNumber: number;
  totalQuestions: number;
  language: string;
  onLanguageChange?: (language: string) => void;
  languageDisabled?: boolean;
  label?: string;
}

export function AssessmentQuestionHeader({
  questionNumber,
  totalQuestions,
  language,
  onLanguageChange,
  languageDisabled = false,
  label = "Question",
}: AssessmentQuestionHeaderProps) {
  const languageOptions = supportedLanguages.map((lang) => ({
    value: lang.code,
    label: lang.name,
  }));

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {label} ({questionNumber}/{totalQuestions})
      </p>

      {onLanguageChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Language:</span>
          <SearchableSelect
            value={language}
            onValueChange={onLanguageChange}
            options={languageOptions}
            placeholder="Select language..."
            disabled={languageDisabled}
            className="w-[180px]"
          />
        </div>
      )}
    </div>
  );
}
