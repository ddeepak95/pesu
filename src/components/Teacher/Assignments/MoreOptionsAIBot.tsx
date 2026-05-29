"use client";

import { PromptConfigEditor } from "@/components/Teacher/Assignments/PromptConfigEditor";
import { PromptPreview } from "@/components/Teacher/Assignments/PromptPreview";
import { MultimodalActionsConfigEditor } from "@/components/Teacher/Assignments/MultimodalActionsConfigEditor";
import { SharedContextSection } from "@/components/Teacher/Assignments/SharedContextSection";
import { SettingsCard } from "@/components/ui/settings-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BotPromptConfig, Question } from "@/types/assignment";
import type { ActivityType } from "@/lib/promptTemplates";
import { Eye, Pencil } from "lucide-react";
import type { AssessmentMode } from "@/lib/settings/registry";
import type { ActionKind } from "@/lib/multimodal/actions/types";

interface MoreOptionsAIBotProps {
  assessmentMode: AssessmentMode;
  showBotPreview: boolean;
  setShowBotPreview: (show: boolean) => void;
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
  setSharedContextEnabled: (enabled: boolean) => void;
  sharedContext: string;
  setSharedContext: (context: string) => void;
  loading: boolean;
  dynamicQuestionsEnabled?: boolean;
  dynamicGenerationPrompt?: string;
  setDynamicGenerationPrompt?: (prompt: string) => void;
  /** Action kinds whose content-generation model is configured + capable for this class. */
  availableActionKinds?: ActionKind[];
}

/** Icon-only Edit/Preview switch shown to the right of the prompt-type tabs. */
function EditPreviewToggle({
  preview,
  onChange,
}: {
  preview: boolean;
  onChange: (preview: boolean) => void;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tabs
        value={preview ? "preview" : "edit"}
        onValueChange={(v) => onChange(v === "preview")}
      >
        <TabsList>
          <TabsTrigger value="edit" aria-label="Edit" className="px-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center">
                  <Pencil className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          </TabsTrigger>
          <TabsTrigger value="preview" aria-label="Preview" className="px-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center">
                  <Eye className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Preview</TooltipContent>
            </Tooltip>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </TooltipProvider>
  );
}

export function MoreOptionsAIBot({
  assessmentMode,
  showBotPreview,
  setShowBotPreview,
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
  setSharedContextEnabled,
  sharedContext,
  setSharedContext,
  loading,
  dynamicQuestionsEnabled = false,
  dynamicGenerationPrompt = "",
  setDynamicGenerationPrompt,
  availableActionKinds,
}: MoreOptionsAIBotProps) {
  const isConversational =
    assessmentMode === "voice" ||
    assessmentMode === "text_chat" ||
    assessmentMode === "multimodal";

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Customize how the AI bot interacts with students and evaluates answers.
        Use variable placeholders to insert dynamic content.
      </p>

      {/* Additional Contextual Information for AI */}
      <SharedContextSection
        sharedContextEnabled={sharedContextEnabled}
        setSharedContextEnabled={setSharedContextEnabled}
        sharedContext={sharedContext}
        setSharedContext={setSharedContext}
        loading={loading}
      />

      {/* Actions (multimodal-only capability toggles) */}
      {assessmentMode === "multimodal" && (
        <SettingsCard className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Actions</h4>
            <p className="text-xs text-muted-foreground">
              Choose which rich content the tutor may use during the
              conversation.
            </p>
          </div>
          <MultimodalActionsConfigEditor
            config={botPromptConfig}
            onChange={setBotPromptConfig}
            availableActionKinds={availableActionKinds}
            disabled={loading}
          />
        </SettingsCard>
      )}

      {/* Prompt Customizations */}
      <SettingsCard className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Prompt Customizations
          </h4>
          <p className="text-xs text-muted-foreground">
            Edit the prompts that drive the bot and its evaluation.
          </p>
        </div>

      {showBotPreview && isConversational ? (
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
          showBotPrompts={isConversational}
          showEndConversation={assessmentMode === "multimodal"}
          showDynamicGenerationPrompt={dynamicQuestionsEnabled}
          evaluationPrompt={evaluationPrompt}
          dynamicGenerationPrompt={dynamicGenerationPrompt}
          rightSlot={
            <EditPreviewToggle
              preview={showBotPreview}
              onChange={setShowBotPreview}
            />
          }
        />
      ) : (
        <PromptConfigEditor
          config={botPromptConfig}
          onChange={setBotPromptConfig}
          disabled={loading}
          showBotPrompts={isConversational}
          showEndConversation={assessmentMode === "multimodal"}
          evaluationPrompt={evaluationPrompt}
          onEvaluationPromptChange={setEvaluationPrompt}
          activityType={activityType}
          interactionType={assessmentMode}
          showDynamicGenerationPrompt={dynamicQuestionsEnabled}
          dynamicGenerationPrompt={dynamicGenerationPrompt}
          onDynamicGenerationPromptChange={setDynamicGenerationPrompt}
          rightSlot={
            isConversational ? (
              <EditPreviewToggle
                preview={showBotPreview}
                onChange={setShowBotPreview}
              />
            ) : undefined
          }
        />
      )}
      </SettingsCard>
    </div>
  );
}
