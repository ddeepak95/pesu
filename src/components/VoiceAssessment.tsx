"use client";
import { useState } from "react";
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
import { VoiceAssessmentProvider, useVoiceTranscript } from "@/contexts/VoiceAssessmentContext";
import { Question } from "@/types/assignment";
import { usePipecatClientTransportState } from "@pipecat-ai/client-react";

interface VoiceAssessmentProps {
  question: Question;
  language: string;
  assignmentId: string;
  questionNumber: number;
  totalQuestions: number;
  onAnswerComplete: (transcript: string) => void;
  isLastQuestion: boolean;
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
  onAnswerComplete,
  isLastQuestion,
}: VoiceAssessmentProps) {
  const { transcript, clearTranscript } = useVoiceTranscript();
  const transportState = usePipecatClientTransportState();
  const isConnected = ["connected", "ready"].includes(transportState);

  const handleComplete = () => {
    const finalTranscript = transcript.trim();
    onAnswerComplete(finalTranscript);
    clearTranscript();
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
      {/* Question Number */}
      <p className="text-lg font-medium">
        Question ({questionNumber}/{totalQuestions})
      </p>

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
        </CardContent>
      </Card>

      {/* Voice Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Voice Answer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Click "Start Recording" to begin your voice response. The AI will
            have a conversation with you about the question. When you're done,
            click "Stop Recording" and then "Done with This Question" to proceed.
          </p>

          <div className="flex justify-center">
            <VoiceConnectButton
              connectionData={connectionData}
              connectLabel="Start Recording"
              disconnectLabel="Stop Recording"
            />
          </div>

          {/* Transcript Display */}
          {transcript && (
            <div className="mt-4 p-4 bg-muted/50 rounded-md">
              <p className="text-sm font-semibold mb-2">Your Response:</p>
              <p className="text-sm whitespace-pre-wrap">{transcript}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-end gap-4">
        <Button
          onClick={handleComplete}
          disabled={isConnected || !transcript}
          size="lg"
        >
          {isLastQuestion ? "Submit Assignment" : "Done with This Question"}
        </Button>
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
    <VoiceClient showVisualizer={true} showTranscript={false}>
      <VoiceAssessmentProvider>
        <VoiceAssessmentContent {...props} />
      </VoiceAssessmentProvider>
    </VoiceClient>
  );
}

