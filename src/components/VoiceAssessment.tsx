"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VoiceClient } from "@/components/VoiceClient";
import { VoiceConnectButton } from "@/components/VoiceConnectButton";
import {
  VoiceAssessmentProvider,
  useVoiceTranscript,
} from "@/contexts/VoiceAssessmentContext";
import { Question } from "@/types/assignment";
import { usePipecatClientTransportState } from "@pipecat-ai/client-react";
import { VoiceVisualizer } from "@pipecat-ai/voice-ui-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supportedLanguages } from "@/utils/supportedLanguages";

interface VoiceAssessmentProps {
  question: Question;
  language: string;
  assignmentId: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswerSave: (transcript: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  isFirstQuestion: boolean;
  isLastQuestion: boolean;
  existingAnswer?: string;
  onLanguageChange?: (language: string) => void;
}

/**
 * Internal component that uses the voice transcript hook
 */
function VoiceAssessmentContent({
  question,
  language,
  assignmentId,
  questionNumber,
  totalQuestions,
  onAnswerSave,
  onPrevious,
  onNext,
  onSubmit,
  isFirstQuestion,
  isLastQuestion,
  existingAnswer,
  onLanguageChange,
}: VoiceAssessmentProps) {
  const { transcript, clearTranscript, setTranscript } = useVoiceTranscript();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  // Load existing answer when question changes
  React.useEffect(() => {
    // Clear and load existing answer when question changes
    if (existingAnswer) {
      setTranscript(existingAnswer);
    } else {
      clearTranscript();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.order, existingAnswer]);

  const handleSaveAndNavigate = (action: "previous" | "next" | "submit") => {
    // Save current transcript if it exists
    if (transcript.trim()) {
      onAnswerSave(transcript.trim());
    }

    // Navigate based on action (useEffect will handle loading the next question's answer)
    if (action === "previous" && onPrevious) {
      onPrevious();
    } else if (action === "next" && onNext) {
      onNext();
    } else if (action === "submit" && onSubmit) {
      onSubmit();
    }
  };

  // Prepare connection data to send to server
  const connectionData = {
    language,
    question_prompt: question.prompt,
    rubric: question.rubric,
    assignment_id: assignmentId,
    question_order: question.order,
  };

  return (
    <div className="space-y-6">
      {/* Question Number and Language Selector */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-medium">
          Question ({questionNumber}/{totalQuestions})
        </p>

        {onLanguageChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Language:</span>
            <Select
              value={language}
              onValueChange={onLanguageChange}
              disabled={isConnected}
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

      {/* Question Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap">{question.prompt}</p>

          {/* View Rubric Accordion */}
          {question.rubric && question.rubric.length > 0 && (
            <Accordion type="single" collapsible>
              <AccordionItem value="rubric">
                <AccordionTrigger>View Rubric</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {question.rubric.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start gap-4 p-3 bg-muted/50 rounded-md"
                      >
                        <span className="flex-1">{item.item}</span>
                        <span className="font-semibold text-sm whitespace-nowrap">
                          {item.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
          {/* Voice Visualizer */}
          <div className="flex justify-center py-4">
            <VoiceVisualizer
              participantType="bot"
              barColor="hsl(var(--primary))"
            />
          </div>

          <div className="flex justify-center">
            <VoiceConnectButton
              connectionData={connectionData}
              connectLabel="Start Answering"
              disconnectLabel="Stop"
            />
          </div>

          {/* Transcript Display */}
          {transcript && (
            <div className="mt-4 p-4 bg-muted/50 rounded-md max-h-96 overflow-y-auto">
              <p className="text-sm font-semibold mb-2">Conversation:</p>
              <div className="text-sm whitespace-pre-wrap">{transcript}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between gap-4">
        <Button
          onClick={() => handleSaveAndNavigate("previous")}
          disabled={isFirstQuestion || isConnected}
          variant="outline"
          size="lg"
        >
          Previous Question
        </Button>

        <div className="flex gap-4">
          {!isLastQuestion && (
            <Button
              onClick={() => handleSaveAndNavigate("next")}
              disabled={isConnected}
              size="lg"
            >
              Next Question
            </Button>
          )}
          {isLastQuestion && (
            <Button
              onClick={() => handleSaveAndNavigate("submit")}
              disabled={isConnected}
              size="lg"
              variant="default"
            >
              Submit Assignment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Main voice assessment component for answering questions via voice
 * Manages voice session for a single question
 */
export function VoiceAssessment(props: VoiceAssessmentProps) {
  return (
    <VoiceClient showVisualizer={false} showTranscript={false}>
      <VoiceAssessmentProvider>
        <VoiceAssessmentContent {...props} />
      </VoiceAssessmentProvider>
    </VoiceClient>
  );
}
