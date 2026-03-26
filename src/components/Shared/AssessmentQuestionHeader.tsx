"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        {label} ({questionNumber}/{totalQuestions})
      </p>

      {onLanguageChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Language:</span>
          <Select
            value={language}
            onValueChange={onLanguageChange}
            disabled={languageDisabled}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
