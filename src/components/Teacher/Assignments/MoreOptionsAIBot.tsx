"use client";

import { Button } from "@/components/ui/button";
import { PromptConfigEditor } from "@/components/Teacher/Assignments/PromptConfigEditor";
import { PromptPreview } from "@/components/Teacher/Assignments/PromptPreview";
import { BotPromptConfig, Question } from "@/types/assignment";
import type { ActivityType } from "@/lib/promptTemplates";
import { Eye } from "lucide-react";

interface MoreOptionsAIBotProps {
  assessmentMode: "voice" | "text_chat" | "static_text";
  showBotPreview: boolean;
  setShowBotPreview: (show: boolean) => void;
  previewQuestionOrder: 0 | 1;
  setPreviewQuestionOrder: (order: 0 | 1) => void;
  botPromptConfig: BotPromptConfig;
  setBotPromptConfig: (config: BotPromptConfig) => void;
  evaluationPrompt: string;
  setEvaluationPrompt: (prompt: string) => void;
  activityType: ActivityType;
  questions: Question[];
  title: string;
  studentInstructions: string;
  preferredLanguage: string;
  maxAttempts: number;
  sharedContextEnabled: boolean;
  sharedContext: string;
  loading: boolean;
  dynamicQuestionsEnabled?: boolean;
  dynamicGenerationPrompt?: string;
  setDynamicGenerationPrompt?: (prompt: string) => void;
}

export function MoreOptionsAIBot({
  assessmentMode,
  showBotPreview,
  setShowBotPreview,
  previewQuestionOrder,
  setPreviewQuestionOrder,
  botPromptConfig,
  setBotPromptConfig,
  evaluationPrompt,
  setEvaluationPrompt,
  activityType,
  questions,
  title,
  studentInstructions,
  preferredLanguage,
  maxAttempts,
  sharedContextEnabled,
  sharedContext,
  loading,
  dynamicQuestionsEnabled = false,
  dynamicGenerationPrompt = "",
  setDynamicGenerationPrompt,
}: MoreOptionsAIBotProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Customize how the AI bot interacts with students and evaluates answers.
        Use variable placeholders to insert dynamic content.
      </p>

      {/* Editor and Preview Toggle (only for voice and text_chat modes) */}
      {(assessmentMode === "voice" || assessmentMode === "text_chat") && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={showBotPreview ? "outline" : "default"}
            size="sm"
            onClick={() => setShowBotPreview(false)}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant={showBotPreview ? "default" : "outline"}
            size="sm"
            onClick={() => setShowBotPreview(true)}
          >
            <Eye className="h-4 w-4 mr-1" />
            Preview
          </Button>
        </div>
      )}

      {showBotPreview &&
      (assessmentMode === "voice" || assessmentMode === "text_chat") ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Preview for:</span>
            <Button
              type="button"
              variant={previewQuestionOrder === 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewQuestionOrder(0)}
            >
              First Question
            </Button>
            <Button
              type="button"
              variant={previewQuestionOrder === 1 ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewQuestionOrder(1)}
            >
              Subsequent Questions
            </Button>
          </div>

          <PromptPreview
            config={botPromptConfig}
            assignment={{
              title,
              student_instructions: studentInstructions,
              questions,
              preferred_language: preferredLanguage,
              max_attempts: maxAttempts,
              shared_context: sharedContextEnabled ? sharedContext : undefined,
            }}
            question={questions[0]}
            languageCode={preferredLanguage}
            assessmentMode={assessmentMode}
            previewQuestionOrder={previewQuestionOrder}
          />
        </div>
      ) : (
        <PromptConfigEditor
          config={botPromptConfig}
          onChange={setBotPromptConfig}
          disabled={loading}
          showBotPrompts={
            assessmentMode === "voice" || assessmentMode === "text_chat"
          }
          evaluationPrompt={evaluationPrompt}
          onEvaluationPromptChange={setEvaluationPrompt}
          activityType={activityType}
          interactionType={assessmentMode}
          showDynamicGenerationPrompt={dynamicQuestionsEnabled}
          dynamicGenerationPrompt={dynamicGenerationPrompt}
          onDynamicGenerationPromptChange={setDynamicGenerationPrompt}
        />
      )}
    </div>
  );
}
